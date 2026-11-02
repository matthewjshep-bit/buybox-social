import { sampleSource } from "./sample";
import type { Listing } from "./types";

// Where listings come from. The app only ever reads the `listings` table, which
// scripts/db-setup.ts fills from this source. To go live, add an adapter for the
// licensed feed (MLS Grid, NWMLS direct or Repliers) and return it below. Feeds
// like MLS Grid must be copied locally anyway: they do not allow live queries.
export interface ListingSource {
  name: string;
  fetchListings(): AsyncIterable<Listing>;
}

export const activeListingSource = (): ListingSource => sampleSource;
