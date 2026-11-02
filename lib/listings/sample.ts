import seed from "../../supabase/seed/listings.json";
import type { ListingSource } from "./source";
import type { Listing } from "./types";

export const sampleSource: ListingSource = {
  name: "sample",
  async *fetchListings() {
    yield* seed as Listing[];
  },
};
