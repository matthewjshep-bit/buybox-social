import type { NextRequest } from "next/server";
import { listPeople, STATUSES } from "@/lib/admin";
import { getCurrentUser, isAdmin } from "@/lib/auth";

// Everyone on the People page, as it's filtered, for a spreadsheet or a CRM.
export async function GET(request: NextRequest) {
  if (!(await isAdmin(await getCurrentUser()))) return new Response("Not found", { status: 404 });
  const params = request.nextUrl.searchParams;
  const status = STATUSES.find((s) => s === params.get("status"));
  const q = params.get("q")?.trim() || undefined;
  const { rows } = await listPeople({ q, status, limit: null });

  const header = ["Name", "Email", "Phone", "Type", "Since", "Last active", "Homes liked", "Comments", "Links sent"];
  const lines = [header, ...rows.map((p) => [
    p.name,
    p.email,
    p.phone,
    p.status,
    p.since.toISOString().slice(0, 10),
    p.last_active?.toISOString().slice(0, 10) ?? "",
    p.likes,
    p.comments,
    p.links,
  ])].map((cells) => cells.map(csvCell).join(","));

  const date = new Date().toISOString().slice(0, 10);
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="buybox-people-${status ?? "everyone"}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

// Quoted, and never read as a formula: names come from a public form, and a
// spreadsheet runs anything starting with = + - or @. (A phone number like
// "+1 206…" is only digits and punctuation, so it's left as it is.)
function csvCell(value: string | number) {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^[+-]?[\d\s().-]+$/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
