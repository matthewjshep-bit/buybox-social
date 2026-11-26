import type { PeopleViewer } from "./people";
import {
  defaultPeriod,
  PERIODS,
  getPopularAgents,
  getPopularHomes,
  getPopularPeople,
  type PopularAgent,
  type PopularHome,
  type PopularPeriod,
  type PopularPerson,
} from "./popular";

// "Top", beside the feed on Home: the head of each of Popular's three lists
// (homes, people, agents), a few of each, over the same time Popular opens on.
// The card turns from one to the next by itself; which it opens on changes
// from visit to visit, so it's never the same card twice running.

// How many of each: enough to be a list, few enough to sit beside the feed.
export const TOP_SHOWN = 5;

export type TopPart = "homes" | "people" | "agents";

export type Top = {
  homes: PopularHome[];
  homesPeriod: PopularPeriod;
  // "This week": the time it's over, as Popular says it.
  homesOver: string;
  people: PopularPerson[];
  peoplePeriod: PopularPeriod;
  peopleOver: string;
  agents: PopularAgent[];
  // The part it opens on.
  start: TopPart;
};

export async function getTop(viewer: PeopleViewer, now: number = Date.now()): Promise<Top> {
  const [homesPeriod, peoplePeriod] = await Promise.all([defaultPeriod("homes"), defaultPeriod("people")]);
  const [homes, people, agents] = await Promise.all([
    getPopularHomes(homesPeriod, TOP_SHOWN),
    getPopularPeople(viewer, peoplePeriod, TOP_SHOWN),
    getPopularAgents(viewer, TOP_SHOWN),
  ]);
  const parts = (
    [
      ["homes", homes.length],
      ["people", people.length],
      ["agents", agents.length],
    ] as const
  ).flatMap(([part, n]) => (n > 0 ? [part] : []));
  // (A new part every few minutes, so coming back to Home finds another one first.)
  const start = parts.length > 0 ? parts[Math.floor(now / 180_000) % parts.length] : "homes";
  const over = (period: PopularPeriod) => PERIODS.find((p) => p.key === period)?.label ?? "";
  return { homes, homesPeriod, homesOver: over(homesPeriod), people, peoplePeriod, peopleOver: over(peoplePeriod), agents, start };
}
