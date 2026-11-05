import { sql } from "./db";
import type { Listing } from "./listings/types";
import { aspectOfTag, isPointTag, photoTags } from "./photos";
import { aspectLabel, type Aspect, type ReactionState } from "./reactions";

// How the people on one package compare: what each likes, where they agree,
// and homes they might all like, from what they've said so far.

export type PackagePerson = { id: string; name: string };

type Thread = {
  reactions: { listingKey: string; participantId: string; state: ReactionState }[];
  photoLikes: { listingKey: string; participantId: string; tag: string; aspect: Aspect | null }[];
};

export type PersonSummary = {
  person: PackagePerson;
  liked: number;
  passed: number;
  // Things they liked, in photos or as specifics: "Kitchen island", "Price".
  likes: string[];
  // Specifics behind their passes: "Price", "Yard".
  passes: string[];
};

export type HomeRow = {
  listing: Listing;
  cells: Record<string, { reaction: ReactionState["reaction"]; likes: string[]; passes: string[] }>;
};

const key = (thing: string) => thing.toLowerCase();

function uniq(things: string[]) {
  const seen = new Set<string>();
  return things.filter((thing) => (seen.has(key(thing)) ? false : (seen.add(key(thing)), true)));
}

export function comparePeople(people: PackagePerson[], thread: Thread, listings: Listing[]) {
  const summaries: PersonSummary[] = people.map((person) => {
    const reactions = thread.reactions.filter((r) => r.participantId === person.id);
    const photoLikes = thread.photoLikes.filter((l) => l.participantId === person.id);
    return {
      person,
      liked: reactions.filter((r) => r.state.reaction === "like").length,
      passed: reactions.filter((r) => r.state.reaction === "dislike").length,
      likes: uniq([...photoLikes.map((l) => l.tag).filter((tag) => !isPointTag(tag)), ...reactions.flatMap((r) => r.state.liked.map(aspectLabel))]),
      passes: uniq(reactions.flatMap((r) => r.state.disliked.map(aspectLabel))),
    };
  });

  // Where they agree and differ, among those who've liked anything.
  const active = summaries.filter((s) => s.likes.length > 0);
  const both =
    active.length >= 2
      ? active[0].likes.filter((thing) => active.every((s) => s.likes.some((t) => key(t) === key(thing))))
      : [];
  const only = Object.fromEntries(
    active.map((s) => [
      s.person.id,
      s.likes.filter((thing) => !active.some((o) => o !== s && o.likes.some((t) => key(t) === key(thing)))),
    ]),
  );

  const homes: HomeRow[] = listings.map((listing) => ({
    listing,
    cells: Object.fromEntries(
      people.map((person) => {
        const state = thread.reactions.find(
          (r) => r.participantId === person.id && r.listingKey === listing.ListingKey,
        )?.state;
        const tags = thread.photoLikes
          .filter((l) => l.participantId === person.id && l.listingKey === listing.ListingKey)
          .map((l) => l.tag)
          .filter((tag) => !isPointTag(tag));
        return [
          person.id,
          {
            reaction: state?.reaction ?? null,
            likes: uniq([...tags, ...(state?.liked ?? []).map(aspectLabel)]),
            passes: (state?.disliked ?? []).map(aspectLabel),
          },
        ];
      }),
    ),
  }));

  return { summaries, both, only, homes };
}

export type Suggestion = {
  listing: Listing;
  // Why, per person: { Jenny: ["pendant lights"], Mike: ["natural light"] }.
  reasons: Record<string, string[]>;
};

// Homes not on the package yet that everyone who's liked something might like
// too: they show things each person liked in photos, the kinds of rooms they
// liked, and sit near the cities and prices of homes they liked.
export async function suggestHomes(
  people: PackagePerson[],
  thread: Thread,
  listings: Listing[],
  limit = 3,
): Promise<{ suggestions: Suggestion[]; together: boolean }> {
  const onPackage = new Set(listings.map((l) => l.ListingKey));
  const tastes = people
    .map((person) => {
      const reactions = thread.reactions.filter((r) => r.participantId === person.id);
      const photoLikes = thread.photoLikes.filter((l) => l.participantId === person.id);
      const likedHomes = reactions
        .filter((r) => r.state.reaction === "like")
        .map((r) => listings.find((l) => l.ListingKey === r.listingKey))
        .filter((l): l is Listing => Boolean(l));
      const prices = likedHomes.map((l) => l.ListPrice);
      return {
        person,
        tags: new Set(photoLikes.filter((l) => !isPointTag(l.tag)).map((l) => key(l.tag))),
        aspects: new Set([
          ...photoLikes.map((l) => l.aspect).filter((a): a is Aspect => Boolean(a)),
          ...reactions.flatMap((r) => r.state.liked),
        ]),
        dislikes: new Set(reactions.flatMap((r) => r.state.disliked)),
        cities: new Set(likedHomes.map((l) => l.City)),
        priceRange: prices.length ? [Math.min(...prices) * 0.85, Math.max(...prices) * 1.15] : null,
      };
    })
    .filter((t) => t.tags.size > 0 || t.aspects.size > 0 || t.cities.size > 0);
  if (tastes.length === 0) return { suggestions: [], together: false };

  const rows = await sql<{ data: Listing }[]>`
    select data from listings where standard_status = 'Active' order by updated_at desc limit 300`;
  const scored = rows
    .map(({ data: listing }) => {
      if (onPackage.has(listing.ListingKey)) return null;
      const homeTags = new Map<string, string>();
      const homeAspects = new Set<Aspect>();
      for (const photo of listing.Media) {
        for (const tag of photoTags(photo)) {
          homeTags.set(key(tag), tag);
          const aspect = aspectOfTag(photo, tag);
          if (aspect) homeAspects.add(aspect);
        }
      }
      const reasons: Record<string, string[]> = {};
      const scores = tastes.map((taste) => {
        let score = 0;
        const why: string[] = [];
        for (const [k, tag] of homeTags) {
          if (taste.tags.has(k)) {
            score += 3;
            why.push(tag.toLowerCase());
          }
        }
        for (const aspect of homeAspects) {
          if (taste.aspects.has(aspect)) score += 1;
          if (taste.dislikes.has(aspect)) score -= 2;
        }
        if (taste.cities.has(listing.City)) {
          score += 1;
          why.push(`in ${listing.City}`);
        }
        if (taste.priceRange && listing.ListPrice >= taste.priceRange[0] && listing.ListPrice <= taste.priceRange[1]) {
          score += 1;
          why.push("their price range");
        }
        reasons[taste.person.name] = uniq(why).slice(0, 2);
        return score;
      });
      // For two or more people, it has to suit each of them.
      if (scores.some((s) => s <= 0)) return null;
      return { listing, reasons, score: Math.min(...scores) * 10 + scores.reduce((a, b) => a + b, 0) };
    })
    .filter((s): s is Suggestion & { score: number } => s !== null)
    .sort((a, b) => b.score - a.score);

  return {
    suggestions: scored.slice(0, limit).map(({ listing, reasons }) => ({ listing, reasons })),
    together: tastes.length >= 2,
  };
}
