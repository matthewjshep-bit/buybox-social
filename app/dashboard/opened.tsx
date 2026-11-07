"use client";

import { useSyncExternalStore } from "react";

// The page is made on a server that may keep another clock, so the time is
// first written for Washington (where these agents work), then for wherever
// the agent's own device says they are.
const FIRST_ZONE = "America/Los_Angeles";

const DAY_MS = 24 * 60 * 60 * 1000;
const never = () => () => {};

// "2:14 pm", "yesterday, 2:14 pm", "Tuesday, 2:14 pm", "Nov 3, 2:14 pm".
function when(iso: string, timeZone?: string) {
  const at = new Date(iso);
  const now = new Date();
  const dayOf = (date: Date) =>
    Date.parse(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date));
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" })
    .format(at)
    .replace(/\s*([AP])M$/, (_, half: string) => ` ${half.toLowerCase()}m`);
  const days = Math.round((dayOf(now) - dayOf(at)) / DAY_MS);
  if (days <= 0) return { today: true, text: time };
  if (days === 1) return { today: false, text: `yesterday, ${time}` };
  if (days < 7) {
    return { today: false, text: `${new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(at)}, ${time}` };
  }
  const sameYear = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" });
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: sameYear.format(at) === sameYear.format(now) ? undefined : "numeric",
  }).format(at);
  return { today: false, text: `${date}, ${time}` };
}

// When a link was last opened, for the agent: "Opened 2:14 pm", or with who it
// was, "Owen opened it Tuesday, 2:14 pm".
export function Opened({ at, name }: { at: string; name?: string | null }) {
  const label = (timeZone?: string) => {
    const { today, text } = when(at, timeZone);
    return name ? `${name} opened it ${today ? "at " : ""}${text}` : `Opened ${text}`;
  };
  const text = useSyncExternalStore(
    never,
    () => label(),
    () => label(FIRST_ZONE),
  );
  return <time dateTime={at}>{text}</time>;
}
