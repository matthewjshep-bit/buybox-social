import { z } from "zod";
import { getCurrentUser } from "./auth";
import { readDevice } from "./engagement";
import { feedKeys, getHomeFeed } from "./home-feed";
import { getProfileFeed, getProfilePerson } from "./profile";
import { getPublicIdentity } from "./public";

// The homes a feed opens full screen, in its order, and the way back to it:
// "feed", your own home feed (signed in); or a page's id, the homes on
// someone's page as whoever's looking sees it. Null for anything else.
export async function homesFrom(from: string) {
  const [account, device] = await Promise.all([getCurrentUser(), readDevice()]);
  const viewer = account?.role ? account : null;
  const { visitor } = await getPublicIdentity(viewer, device);
  if (from === "feed") {
    if (!viewer) return null;
    return {
      keys: feedKeys(await getHomeFeed(viewer, visitor?.id ?? null)),
      back: { href: "/", label: "Back to your feed" },
    };
  }
  if (!z.uuid().safeParse(from).success) return null;
  const person = await getProfilePerson(from);
  if (!person) return null;
  const isMe = visitor?.id === person.id;
  const { cards } = await getProfileFeed(person.id, { mine: isMe, passes: isMe || !person.hidePasses });
  const name = person.name.trim();
  return {
    keys: [...new Set(cards.map((card) => card.home.key))],
    back: {
      href: `/people/${person.id}`,
      label: isMe ? "Back to your page" : name ? `Back to ${name}'s page` : "Back to their page",
    },
  };
}
