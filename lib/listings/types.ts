// Field names follow the RESO Data Dictionary, so a licensed feed maps across
// with little change.
export type ListingMedia = {
  MediaKey?: string;
  MediaURL: string;
  Order: number;
  // RESO: "Photo", "Video", ... Videos play in the feed.
  MediaCategory?: string;
  ShortDescription?: string;
  // What the photo shows ("Kitchen"). RESO's ImageOf; a photo tagger fills it
  // in when the feed doesn't.
  ImageOf?: string;
  // Not a RESO field: notable things in the photo ("Marble counters"), from a
  // photo tagger, or written by hand for the sample listings.
  Features?: string[];
  // RESO: the photo's size, so things in it can be pointed at.
  ImageWidth?: number;
  ImageHeight?: number;
  // Not a RESO field: where each feature sits in the photo, as fractions of
  // its width and height, from an object detector (or by hand for samples).
  Spots?: { tag: string; x: number; y: number }[];
  // Not a RESO field: everything a photo scan found, as boxes (the top left
  // corner and size, as fractions), so a tap anywhere can be named. `aspect`
  // is the broad specific it counts toward, when there is one.
  Regions?: { tag: string; x: number; y: number; w: number; h: number; aspect?: string }[];
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
  // RESO: the listing agent's MLS member ID. What ties a listing to an agent's page.
  ListAgentMlsId?: string;
  Latitude?: number;
  Longitude?: number;
  OnMarketDate?: string;
  ListOfficeName?: string;
  Media: ListingMedia[];
};

export const isSampleListing = (listing: Listing) =>
  listing.ListingKey.startsWith("SAMPLE-");
