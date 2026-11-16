import { after } from "next/server";
import { runImportsAndContinue } from "@/lib/listings/imports";

// The import worker: scans the photos of homes that were just brought in
// (lib/listings/imports.ts). Asked for by an import that ran out of time, and
// safe to call on a schedule too (a Vercel cron sends the same header). It
// answers at once and works afterwards, for as long as it's allowed.
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  // Open only where there's no secret to ask for: on someone's own machine.
  const allowed = secret
    ? request.headers.get("authorization") === `Bearer ${secret}`
    : process.env.NODE_ENV !== "production";
  if (!allowed) return new Response("Not allowed", { status: 401 });
  after(() => runImportsAndContinue(200_000));
  return Response.json({ started: true }, { status: 202 });
}
