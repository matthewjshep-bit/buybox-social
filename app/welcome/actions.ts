"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sql } from "@/lib/db";

export type WelcomeState = { error?: string };

const schema = z.object({
  role: z.enum(["agent", "buyer"]),
  fullName: z
    .string()
    .transform((name) => name.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1).max(80)),
});

export async function completeSignup(_: WelcomeState, form: FormData): Promise<WelcomeState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const parsed = schema.safeParse({ role: form.get("role"), fullName: form.get("fullName") });
  if (!parsed.success) return { error: "Please choose one and add your name." };
  await sql`
    update accounts set role = ${parsed.data.role}, full_name = ${parsed.data.fullName}
    where id = ${user.id}`;
  // Agents finish their brand profile next; buyers go straight to the feed.
  redirect(parsed.data.role === "agent" ? "/dashboard/profile" : "/");
}
