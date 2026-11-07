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
  // Liked in one home and passed on in another (the layout here, not
  // there): neither a like nor a pass of theirs, so in neither list above.
  mixed: string[];
};

export type HomeRow = {
  listing: Listing;
  cells: Record<string, { reaction: ReactionState["reaction"]; likes: string[]; passes: string[] }>;
};

const key = (thing: string) => thing.toLowerCase();
const has = (things: string[], thing: string) => things.some((t) => key(t) === key(thing));

function uniq(things: string[]) {
  const seen = new Set<string>();
  return things.filter((thing) => (seen.has(key(thing)) ? false : (seen.add(key(thing)), true)));
}

export function comparePeople(people: PackagePerson[], thread: Thread, listings: Listing[]) {
  // In any one home, what someone picked when they passed wins over a heart
  // in its photos: passing on the kitchen and hearting the kitchen photo
  // isn't liking the kitchen (as in the Scorecard).
  const passedIn = (personId: string, listingKey: string) =>
    (thread.reactions.find((r) => r.participantId === personId && r.listingKey === listingKey)?.state.disliked ?? []).map(
      aspectLabel,
    );
  const likedTags = (personId: string, listingKey?: string) =>
    thread.photoLikes
      .filter((l) => l.participantId === personId && (!listingKey || l.listingKey === listingKey))
      .filter((l) => !isPointTag(l.tag) && !has(passedIn(personId, l.listingKey), l.tag))
      .map((l) => l.tag);

  const summaries: PersonSummary[] = people.map((person) => {
    const reactions = thread.reactions.filter((r) => r.participantId === person.id);
    const likes = uniq([...likedTags(person.id), ...reactions.flatMap((r) => r.state.liked.map(aspectLabel))]);
    const passes = uniq(reactions.flatMap((r) => r.state.disliked.map(aspectLabel)));
    const mixed = likes.filter((thing) => has(passes, thing));
    return {
      person,
      liked: reactions.filter((r) => r.state.reaction === "like").length,
      passed: reactions.filter((r) => r.state.reaction === "dislike").length,
      likes: likes.filter((thing) => !has(mixed, thing)),
      passes: passes.filter((thing) => !has(mixed, thing)),
      mixed,
    };
  });

  const homes: HomeRow[] = listings.map((listing) => ({
    listing,
    cells: Object.fromEntries(
      people.map((person) => {
        const state = thread.reactions.find(
          (r) => r.participantId === person.id && r.listingKey === listing.ListingKey,
        )?.state;
        return [
          person.id,
          {
            reaction: state?.reaction ?? null,
            likes: uniq([...likedTags(person.id, listing.ListingKey), ...(state?.liked ?? []).map(aspectLabel)]),
            passes: (state?.disliked ?? []).map(aspectLabel),
          },
        ];
      }),
    ),
  }));

  // Where they agree and differ, among everyone who's liked anything. What
  // depends on the home for one of them is agreed only where they all liked
  // it in the same home, and says which: "Layout (96 Fernhollow Ln)". What
  // only one of them likes leaves out anyone it depends on the home for.
  const likers = summaries.filter((s) => s.likes.length + s.mixed.length > 0);
  const agreed = new Set<string>();
  const both: string[] = [];
  if (likers.length >= 2) {
    for (const thing of [...likers[0].likes, ...likers[0].mixed]) {
      if (likers.every((s) => has(s.likes, thing))) both.push(thing);
      else if (likers.every((s) => has(s.likes, thing) || has(s.mixed, thing))) {
        const where = homes.filter((home) => likers.every((s) => has(home.cells[s.person.id]?.likes ?? [], thing)));
        if (where.length === 0) continue;
        both.push(`${thing} (${where.map((home) => home.listing.UnparsedAddress).join(", ")})`);
      } else continue;
      agreed.add(key(thing));
    }
  }
  const only = Object.fromEntries(
    likers.map((s) => [
      s.person.id,
      s.likes.filter((thing) => !agreed.has(key(thing)) && !likers.some((o) => o !== s && has(o.likes, thing))),
    ]),
  );

  return { summaries, likers, both, only, homes };
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
