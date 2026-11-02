// Field names follow the RESO Data Dictionary, so a licensed feed maps across
// with little change.
export type ListingMedia = {
  MediaURL: string;
  Order: number;
  ShortDescription?: string;
};

export type Listing = {
  ListingKey: string;
  ListingId: string;
  StandardStatus: string;
  ListPrice: number;
  UnparsedAddress: string;
  City: string;
  StateOrProvince: string;
  PostalCode: string;
  BedroomsTotal: number;
  BathroomsTotalInteger: number;
  LivingArea: number;
  YearBuilt?: number;
  PropertySubType?: string;
  PublicRemarks?: string;
  ListAgentFullName?: string;
  ListOfficeName?: string;
  Media: ListingMedia[];
};

export const isSampleListing = (listing: Listing) =>
  listing.ListingKey.startsWith("SAMPLE-");
