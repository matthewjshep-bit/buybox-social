// What someone is on Porchcard (accounts.kind): an agent, an investor, a
// lender, or someone shopping for a home. The first three are pros, with the
// same tools (their role is "agent"); someone shopping is a buyer. Safe to
// use anywhere, the browser included.

export const KINDS = ["agent", "investor", "lender", "buyer"] as const;
export type Kind = (typeof KINDS)[number];
export const PRO_KINDS = ["agent", "investor", "lender"] as const;
export type ProKind = (typeof PRO_KINDS)[number];

export const isKind = (value: unknown): value is Kind => typeof value === "string" && (KINDS as readonly string[]).includes(value);
export const isProKind = (value: unknown): value is ProKind =>
  typeof value === "string" && (PRO_KINDS as readonly string[]).includes(value);

// What they are, or, until they've said, what their role makes them.
export const kindOf = (account: { kind?: string | null; role?: string | null } | null | undefined): Kind =>
  isKind(account?.kind) ? account.kind : account?.role === "agent" ? "agent" : "buyer";

// The chip beside a pro's name. (Someone shopping has none.)
export const KIND_LABEL: Record<Kind, string | null> = { agent: "Agent", investor: "Investor", lender: "Lender", buyer: null };

// What each calls the homes they put up: an investor's are deals; everyone
// else's, listings. `Mine`: what their own are called, to them (their menu,
// their page for them, the tab on their own profile): an investor's are "My
// Deals".
export type ListingWords = { one: string; many: string; One: string; Many: string; Mine: string };
const LISTINGS: ListingWords = { one: "listing", many: "listings", One: "Listing", Many: "Listings", Mine: "Listings" };
const DEALS: ListingWords = { one: "deal", many: "deals", One: "Deal", Many: "Deals", Mine: "My Deals" };
export const listingWords = (kind: Kind | null | undefined): ListingWords => (kind === "investor" ? DEALS : LISTINGS);
