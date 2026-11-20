import type { ClientLink, Client, ClientStatus } from "../clients";
import { appUrl } from "../format";
import type { Listing } from "../listings/types";
import { photosOf, type OwnListing } from "../own-listings";

// What the API gives back, made from what the site already reads: names in
// snake_case, dates as ISO strings, every address on the site in full (a
// tool has no "current page" to read "/homes/…" against). Nothing here ever
// carries an email address or a phone number, a client's surname, or a
// device's token: a client is the first name they're known by, and the link
// that's theirs.

const iso = (date: Date | string | null | undefined) => (date ? new Date(date).toISOString() : null);

// A full address on the site for a path ("/listing-photo/…", "/sample/…"),
// and an address elsewhere as it is. Anything that isn't a web address at
// all (a photo kept as a data URL) is left out.
export function absoluteUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const full = new URL(url, appUrl());
    return full.protocol === "https:" || full.protocol === "http:" ? full.toString() : null;
  } catch {
    return null;
  }
}

const homeUrl = (key: string) => `${appUrl()}/homes/${encodeURIComponent(key)}`;
const profileUrl = (profileId: string | null) => (profileId ? `${appUrl()}/people/${profileId}` : null);

// "Active", "Closed", or under contract in any of the ways a feed says it.
function statusOf(listing: Listing) {
  const status = (listing.StandardStatus ?? "").trim();
  const plain = status.toLowerCase().replace(/[\s_-]+/g, "");
  if (plain === "active") return "active";
  if (plain === "closed" || plain === "sold") return "closed";
  if (plain === "pending" || plain === "activeundercontract" || plain === "undercontract") return "pending";
  return status.toLowerCase();
}

const numberOrNull = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

export function homeJson(listing: Listing) {
  return {
    key: listing.ListingKey,
    mls_number: listing.ListingId?.trim() || null,
    status: statusOf(listing),
    address: listing.UnparsedAddress ?? "",
    city: listing.City ?? "",
    state: listing.StateOrProvince ?? "",
    zip: listing.PostalCode ?? "",
    price: numberOrNull(listing.ListPrice),
    beds: numberOrNull(listing.BedroomsTotal),
    baths: numberOrNull(listing.BathroomsTotalInteger),
    sqft: numberOrNull(listing.LivingArea),
    year_built: numberOrNull(listing.YearBuilt),
    type: listing.PropertySubType?.trim() || null,
    description: listing.PublicRemarks ?? "",
    // Photos only (videos aren't pictures a tool can show), in their order.
    photos: photosOf({ ...listing, Media: [...(listing.Media ?? [])].sort((a, b) => a.Order - b.Order) })
      .map((media) => absoluteUrl(media.MediaURL))
      .filter((url): url is string => url !== null),
    url: homeUrl(listing.ListingKey),
    listed_by: {
      agent: listing.ListAgentFullName?.trim() || null,
      office: listing.ListOfficeName?.trim() || null,
    },
  };
}

export type HomeJson = ReturnType<typeof homeJson>;

// One of the agent's own listings (a deal), with what only its owner sees:
// whether it's on their profile, what they've said about the deal, and where
// to change it on the site.
export function ownListingJson(own: OwnListing) {
  const { listing } = own;
  return {
    ...homeJson(listing),
    own: true as const,
    shown: own.active,
    closed: own.closed,
    arv: numberOrNull(listing.AfterRepairValue),
    rehab: numberOrNull(listing.EstimatedRehab),
    show_price_per_sqft: !listing.HidePricePerSqFt,
    updated_at: iso(own.updatedAt),
    edit_url: `${appUrl()}/dashboard/listings/${encodeURIComponent(listing.ListingKey)}`,
  };
}

export type OwnListingJson = ReturnType<typeof ownListingJson>;

// The one thing to say about a client first, in the words the Clients page
// uses.
export function clientStatusText(status: ClientStatus) {
  switch (status.kind) {
    case "ask":
      return `Wants to see ${status.address}`;
    case "comment":
      return `Said: “${status.body}”`;
    case "active":
      return "Looking now";
    case "liked":
      return `Liked ${status.n} of ${status.of} ${status.of === 1 ? "home" : "homes"}`;
    case "opened":
      return "Opened";
    case "unopened":
      return "Not opened yet";
  }
}

export function clientJson(client: Client) {
  return {
    id: client.key,
    name: client.name,
    profile_url: profileUrl(client.profileId),
    status: { kind: client.status.kind, text: clientStatusText(client.status) },
    homes_sent: client.homes,
    liked: client.liked,
    passed: client.passed,
    comments: client.comments,
    waiting: client.waiting,
    opened: client.opened,
    last_active_at: iso(client.lastActive),
    sent_at: iso(client.sentAt),
    link_url: `${appUrl()}${client.linkPath}`,
    link_ids: client.links.map((link) => link.shareId),
  };
}

export type ClientJson = ReturnType<typeof clientJson>;

export function linkJson(link: ClientLink) {
  return {
    id: link.shareId,
    title: link.title,
    created_at: iso(link.sentAt),
    opened_at: iso(link.openedAt),
    homes: link.homes,
    liked: link.liked,
    comments: link.comments,
    waiting: link.waiting,
    // Everyone on it, by first name.
    people: link.for,
    // The one link to send, with one person (or nobody yet) on it. With
    // several, each has their own (GET /links/{id} lists them).
    url: link.linkPath ? `${appUrl()}${link.linkPath}` : null,
    dashboard_url: `${appUrl()}${link.href}`,
  };
}

export type LinkJson = ReturnType<typeof linkJson>;
