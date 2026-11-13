import { z } from "zod";

// Who a link is for, as the people picker and the server pass it between
// them. Safe in the browser and on the server: no database here.

// What the browser sends: a first name typed in, or someone's public profile
// it picked. Never an account, and never an email.
export type PersonPick = { name: string } | { visitorId: string };

// One suggestion in the picker. Only what anyone could see on the person's
// own page: their first name and photo. `context` is how the agent knows
// them ("Your client · 2 links", "Follows you", "On Porchcard").
export type PersonOption = {
  // "v:<visitorId>" for someone on Porchcard, "n:<lowercased name>" for a
  // past client who never signed up.
  key: string;
  pick: PersonPick;
  name: string;
  photo: string | null;
  group: "client" | "follow" | "member";
  context: string;
  agent: boolean;
};

export const NOT_AN_EMAIL = "Type a first name, not an email";

// A first name: up to 40 characters, and never an email (typing someone's
// email must not find them, nor become their name on a link).
export const firstNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .refine((name) => !name.includes("@"), NOT_AN_EMAIL);

export const pickSchema = z.union([
  z.object({ name: firstNameSchema }).strict(),
  z.object({ visitorId: z.uuid() }).strict(),
]);

// What's wrong with a list of picks, in words for the agent.
export function pickError(picks: unknown): string {
  const named = Array.isArray(picks) ? picks : [picks];
  if (named.some((pick) => typeof pick?.name === "string" && pick.name.includes("@"))) return NOT_AN_EMAIL;
  if (named.some((pick) => typeof pick?.name === "string" && pick.name.trim().length > 40)) {
    return "First names can be up to 40 characters.";
  }
  return "Please enter their first name.";
}

// What a link is called, from the first names of the people on it in the
// order they were added: "Jenny", "Jenny & Mike", "Jenny, Mike & Sam",
// "Jenny, Mike, Sam & 2 more", or "Jenny & 4 more" when that's over 60
// characters. The database names links the same way (share_people_title);
// this is only for showing what a link will be called before it's made.
export function peopleTitle(names: string[]) {
  const people = names.map((name) => name.trim()).filter(Boolean);
  const n = people.length;
  if (n === 0) return "";
  const title =
    n === 1
      ? people[0]
      : n === 2
        ? `${people[0]} & ${people[1]}`
        : n === 3
          ? `${people[0]}, ${people[1]} & ${people[2]}`
          : `${people[0]}, ${people[1]}, ${people[2]} & ${n - 3} more`;
  // (Counted as the database counts characters, not UTF-16 units.)
  if ([...title].length <= 60) return title;
  return `${[...people[0]].slice(0, 40).join("")}${n > 1 ? ` & ${n - 1} more` : ""}`;
}

// A link's name wherever it's shown: who it's for, or, with nobody on it yet,
// the first home on it.
export const linkTitle = (clientName: string | null | undefined, firstAddress?: string | null) =>
  clientName?.trim() || (firstAddress ? `Link for ${firstAddress}` : "Link with no homes");
