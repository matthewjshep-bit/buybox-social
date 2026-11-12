import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { siteOrigin } from "@/lib/site";

// For trying the site before its sign-in emails are set up. With
// TEST_SIGN_IN_PASSWORD set (8 characters or more), the sign-in page also takes
// any email and that one password, and signs in as that email with no code:
// the account already there for it, or a new one. Anyone who knows the password
// can be anyone, so it's for testing only. Unset it before real people use the
// site, and it's gone (and everyone it signed in is signed out).
const secret = process.env.TEST_SIGN_IN_PASSWORD ?? "";
export const testSignInEnabled = secret.length >= 8;

const COOKIE = "pc_test_user";

const digest = (text: string) => createHash("sha256").update(text).digest();
const sign = (payload: string) => createHmac("sha256", secret).update(payload).digest("base64url");

export const testPasswordMatches = (password: string) =>
  testSignInEnabled && timingSafeEqual(digest(password), digest(secret));

// Signed with the password itself, so changing it signs everyone out too.
export async function setTestUser(user: { id: string; email: string }) {
  const payload = Buffer.from(JSON.stringify({ id: user.id, email: user.email })).toString("base64url");
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: (await siteOrigin()).startsWith("https:"),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function readTestUser(): Promise<{ id: string; email: string } | null> {
  if (!testSignInEnabled) return null;
  const [payload, signature] = (await cookies()).get(COOKIE)?.value.split(".") ?? [];
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const user = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof user?.id === "string" && typeof user?.email === "string" ? { id: user.id, email: user.email } : null;
  } catch {
    return null;
  }
}

export async function clearTestUser() {
  (await cookies()).delete(COOKIE);
}
