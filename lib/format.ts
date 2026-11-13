import clsx, { type ClassValue } from "clsx";

export const cn = (...inputs: ClassValue[]) => clsx(inputs);

export const appUrl = () =>
  process.env.APP_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

// Text to look for with `like`, taken as it is: its own % and _ match only
// themselves.
export const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

export const formatPrice =(price: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(price);

export function timeAgo(iso: string, now = Date.now()) {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// An agent by first name in a sentence ("Liked by Jordan"), or "your agent"
// when they haven't given a name.
export const agentFirstName = (name: string | null | undefined, fallback = "your agent") =>
  name?.trim().split(/\s+/)[0] || fallback;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// "Active 2h ago" for recent activity; older activity isn't worth calling out.
export function activeLabel(iso: string | null, now = Date.now()) {
  if (!iso || now - new Date(iso).getTime() > WEEK_MS) return null;
  const ago = timeAgo(iso, now);
  return ago === "just now" ? "Active just now" : `Active ${ago} ago`;
}

// All pass white text at WCAG AA, so any choice stays readable.
export const BRAND_COLORS = [
  { name: "Evergreen", value: "#1F5F5B" },
  { name: "Puget Blue", value: "#1E3A5F" },
  { name: "Cedar", value: "#8A4B14" },
  { name: "Merlot", value: "#7A2E3B" },
  { name: "Moss", value: "#3F4A2F" },
  { name: "Plum", value: "#4B3B78" },
];
