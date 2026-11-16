// Homes from Repliers (repliers.com), asked for one at a time: nothing is
// copied in bulk. A typed address finds a few; the one that's picked is
// fetched by its MLS number and saved (lib/listings/imports.ts). Photos stay
// on Repliers' CDN.
import type { Listing, ListingMedia } from "./types";

const API = "https://api.repliers.io";
const CDN = "https://cdn.repliers.io";
// A home's key here: its MLS number, marked as Repliers'.
const PREFIX = "RP-";
// The most photos kept for one home.
const MOST_PHOTOS = 60;

export const repliersEnabled = () => Boolean(process.env.REPLIERS_API_KEY);
export const isRepliersKey = (listingKey: string) => /^RP-[A-Za-z0-9]{1,40}$/.test(listingKey);
const mlsNumberOf = (listingKey: string) => listingKey.slice(PREFIX.length);

// Only the fields used here; Repliers sends many more.
type RepliersListing = {
  mlsNumber: string;
  status?: string | null; // "A" for sale, "U" not
  standardStatus?: string | null;
  type?: string | null; // "Sale" | "Lease"
  class?: string | null;
  listPrice?: number | string | null;
  listDate?: string | null;
  images?: string[] | null;
  permissions?: { displayPublic?: string | null; displayAddressOnInternet?: string | null } | null;
  address?: {
    streetNumber?: string | null;
    streetDirectionPrefix?: string | null;
    streetName?: string | null;
    streetSuffix?: string | null;
    streetDirection?: string | null;
    unitNumber?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  } | null;
  map?: { latitude?: number | null; longitude?: number | null } | null;
  details?: {
    numBedrooms?: number | string | null;
    numBathrooms?: number | string | null;
    sqft?: number | string | null;
    yearBuilt?: number | string | null;
    style?: string | null;
    propertyType?: string | null;
    description?: string | null;
  } | null;
  office?: { brokerageName?: string | null } | null;
  agents?: { name?: string | null; boardAgentId?: string | null; agentId?: string | null }[] | null;
  imageInsights?: { images?: { image?: string; classification?: { imageOf?: string | null } | null }[] | null } | null;
};

// "3385", 3385 or "1500-2000" (the low end): a whole number, or 0.
const whole = (value: number | string | null | undefined) => {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

// "Front of Structure" is how Repliers names the photo of the outside.
const roomOf = (imageOf: string | null | undefined) =>
  !imageOf ? undefined : /front of structure/i.test(imageOf) ? "Exterior" : imageOf;

const photoUrl = (image: string) => `${CDN}/${image}?class=large`;
// The same photo, small: enough to tell its shape.
export const smallCopy = (url: string) => url.replace("?class=large", "?class=small");

// A Repliers listing under RESO names, or null for one that can't be shown:
// not a home for sale, or one its MLS keeps off public sites.
function toListing(l: RepliersListing): Listing | null {
  const a = l.address ?? {};
  if (!l.mlsNumber || !isRepliersKey(PREFIX + l.mlsNumber)) return null;
  if (l.type && l.type !== "Sale") return null;
  if (l.class === "CommercialProperty") return null;
  if (l.permissions?.displayPublic === "N" || l.permissions?.displayAddressOnInternet === "N") return null;
  const street = [a.streetNumber, a.streetDirectionPrefix, a.streetName, a.streetSuffix, a.streetDirection]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  if (!street || !a.city) return null;
  const d = l.details ?? {};
  const rooms = new Map((l.imageInsights?.images ?? []).map((i) => [i.image, roomOf(i.classification?.imageOf)]));
  const agent = l.agents?.[0];
  const year = whole(d.yearBuilt);
  return {
    ListingKey: PREFIX + l.mlsNumber,
    ListingId: l.mlsNumber,
    // Anything still for sale counts as active here ("Active Under Contract" too).
    StandardStatus: l.status === "A" ? "Active" : (l.standardStatus ?? "Closed"),
    ListPrice: whole(l.listPrice),
    UnparsedAddress: a.unitNumber?.trim() ? `${street} #${a.unitNumber.trim()}` : street,
    City: a.city,
    StateOrProvince: a.state ?? "",
    PostalCode: a.zip ?? "",
    BedroomsTotal: whole(d.numBedrooms),
    BathroomsTotalInteger: whole(d.numBathrooms),
    LivingArea: whole(d.sqft),
    ...(year ? { YearBuilt: year } : {}),
    PropertySubType: d.style ?? d.propertyType ?? undefined,
    PublicRemarks: d.description ?? undefined,
    ListAgentFullName: agent?.name ?? undefined,
    ListAgentMlsId: agent?.boardAgentId ?? agent?.agentId ?? undefined,
    Latitude: l.map?.latitude ?? undefined,
    Longitude: l.map?.longitude ?? undefined,
    OnMarketDate: l.listDate?.slice(0, 10),
    ListOfficeName: l.office?.brokerageName ?? undefined,
    Media: (l.images ?? []).slice(0, MOST_PHOTOS).map(
      (image, i): ListingMedia => ({
        MediaKey: image,
        MediaURL: photoUrl(image),
        Order: i + 1,
        MediaCategory: "Photo",
        ...(rooms.get(image) ? { ImageOf: rooms.get(image) } : {}),
      }),
    ),
  };
}

async function get<T>(path: string, timeoutMs: number): Promise<T | null> {
  const key = process.env.REPLIERS_API_KEY;
  if (!key) return null;
  const response = await fetch(`${API}${path}`, {
    headers: { "REPLIERS-API-KEY": key, accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Repliers answered ${response.status}`);
  return (await response.json()) as T;
}

// Homes for sale that match what was typed (an address, part of one, a ZIP or
// an MLS number): a few, to pick from. Not saved. Slow or failing, it finds
// nothing: what's already here still shows.
export async function findOnRepliers(text: string, most = 6): Promise<Listing[]> {
  if (!repliersEnabled() || text.trim().length < 4) return [];
  const query = new URLSearchParams({ search: text.trim(), status: "A", type: "sale", resultsPerPage: String(most * 2) });
  try {
    const found = await get<{ listings?: RepliersListing[] }>(`/listings?${query}`, 4000);
    return (found?.listings ?? []).flatMap((l) => toListing(l) ?? []).slice(0, most);
  } catch (error) {
    console.error("[repliers] search failed", error);
    return [];
  }
}

// One home by its key here, as it is now; null when it's gone or can't be shown.
export async function fetchFromRepliers(listingKey: string): Promise<Listing | null> {
  if (!isRepliersKey(listingKey)) return null;
  const found = await get<RepliersListing>(`/listings/${encodeURIComponent(mlsNumberOf(listingKey))}`, 10_000);
  return found ? toListing(found) : null;
}
