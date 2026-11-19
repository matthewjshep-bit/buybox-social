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

// What was typed to find a home, a word at a time: "5902 Lakeview Terrace SE,
// Mercer Island" is six words, its comma (and any full stop) only a space. No
// more than eight are looked for.
export const placeWords = (text: string) => text.replace(/[,.]/g, " ").split(/\s+/).filter(Boolean).slice(0, 8);

// Names in a sentence: "Sam", "Sam and Ana", "Sam, Ana and Lee".
export const namesList = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

// The same with a crowd: up to three are all named, then it's "Sam, Ana and
// 2 others".
export const namesOrOthers = (names: string[]) =>
  namesList(names.length > 3 ? [...names.slice(0, 2), `${names.length - 2} others`] : names);

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

// "today", "yesterday", "4 days ago", "Nov 7": whole words, never "4d". By
// the homes' days (Pacific), so "yesterday" turns over when theirs does.
export function whenWords(date: Date, now = Date.now()) {
  const day = (d: Date | number) => new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const days = Math.round((Date.parse(day(now)) - Date.parse(day(date))) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
}

// An agent by first name in a sentence ("Liked by Jordan"), or "your agent"
// when they haven't given a name.
export const agentFirstName = (name: string | null | undefined, fallback = "your agent") =>
  name?.trim().split(/\s+/)[0] || fallback;

// All pass white text at WCAG AA, so any choice stays readable.
export const BRAND_COLORS = [
  { name: "Evergreen", value: "#1F5F5B" },
  { name: "Puget Blue", value: "#1E3A5F" },
  { name: "Cedar", value: "#8A4B14" },
  { name: "Merlot", value: "#7A2E3B" },
  { name: "Moss", value: "#3F4A2F" },
  { name: "Plum", value: "#4B3B78" },
];
