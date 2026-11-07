import { formatPrice } from "@/lib/format";

// What a link to one home says when an agent sends it: the same words from
// a home's Send button, the map and a client's page on the dashboard.
export const HOME_MESSAGE_TITLE = "A home for you";

export const homeMessage = (home: { address: string; price: number }) =>
  `I picked a home for you: ${home.address}, ${formatPrice(home.price)}. Tell me what you think.`;
