import { House, Palette, Plus, Send, UserRound } from "lucide-react";
import Link from "next/link";
import { ClientFeed } from "@/components/home/client-feed";
import { ClientsRail } from "@/components/home/clients-rail";
import { HomeShell, ProfileRail } from "@/components/home/home-shell";
import { Avatar } from "@/components/ui";
import type { ClientCard } from "@/lib/client-feed";
import type { ClientBook } from "@/lib/clients";
import type { FollowCounts } from "@/lib/follows";
import type { BannerChoice } from "@/lib/banner";
import { cn } from "@/lib/format";
import { button, card } from "@/lib/ui";

// An agent's home is them and their clients, nothing else. Down the left,
// them: their card (clients, links sent, followers) and their places. In the
// middle, a box to send homes, then what their clients did on the homes they
// sent, photo by photo, as anyone's own page shows it, each with Reply to
// answer them right there. Down the right, their clients as people, whoever
// wants something first. Nothing to tick off: what a client is waiting for is
// said beside their name, and its card's Reply is the filled button.

// "Send homes to…": shaped like a box to type in, as a post box is, and opening
// the builder with the people picker ready.
function Composer({ me }: { me: { name: string; photo: string | null } }) {
  return (
    <div className={cn(card, "flex items-center gap-3 p-3")}>
      <Avatar name={me.name} tone="agent" photo={me.photo} size={10} />
      <Link
        href="/dashboard/new?focus=to"
        aria-label="Send homes to a client"
        className="flex h-11 min-w-0 flex-1 items-center rounded-full border border-stone-300 px-4 text-body hover:border-stone-400 hover:bg-stone-50"
      >
        <span className="text-stone-600">Send homes to…</span>
      </Link>
    </div>
  );
}

// An agent who hasn't sent anything yet: the one thing to do.
function FirstSend() {
  return (
    <section aria-labelledby="first-send-title" className={cn(card, "px-5 py-7 text-center")}>
      <h2 id="first-send-title" className="font-display text-2xl">
        Send your first homes
      </h2>
      <p className="mx-auto mt-1.5 max-w-sm text-balance text-body text-stone-700">
        Pick homes and add your client.
      </p>
      <Link href="/dashboard/new" className={cn(button({ kind: "primary" }), "mt-4")}>
        Choose homes
      </Link>
    </section>
  );
}

export function AgentHome({
  me,
  profileHref,
  book,
  cards,
  follows,
}: {
  me: { id: string; name: string; photo: string | null; brokerage: string; brandColor: string; banner: BannerChoice };
  // Their own public page.
  profileHref: string;
  book: ClientBook;
  cards: ClientCard[];
  follows: FollowCounts;
}) {
  const { clients, unclaimed } = book;
  const sent = new Set([...clients.flatMap((c) => c.links.map((link) => link.shareId)), ...unclaimed.map((l) => l.shareId)]);
  return (
    <HomeShell
      // (For a screen reader: on screen, the page is plainly the agent's.)
      // Said at the top, small: this is the agent's side, not their public profile.
      title="Agent dashboard"
      shown
      left={
        <ProfileRail
          name={me.name}
          photo={me.photo}
          seed={me.id}
          agent
          bandColor={me.brandColor}
          banner={me.banner}
          line={me.brokerage.trim() || "Real estate agent"}
          href={profileHref}
          stats={[
            { label: "Clients", value: clients.length, href: "/dashboard" },

            { label: "Followers", value: follows.followers, href: profileHref.endsWith("/me") ? profileHref : `${profileHref}/followers` },
          ]}
          links={[
            { href: "/dashboard/new", label: "Send homes", icon: <Plus size={18} /> },
            { href: profileHref, label: "Your profile", icon: <UserRound size={18} /> },
            { href: "/dashboard/listings", label: "Listings", icon: <House size={18} /> },
            { href: "/dashboard/profile", label: "Your brand", icon: <Palette size={18} /> },
          ]}
        />
      }
      right={
        <>
          <ClientsRail clients={clients} />
          {unclaimed.length > 0 && (
            <p className="flex items-center gap-1.5 px-1 text-meta text-muted">
              <Send aria-hidden size={13} />
              <Link href="/dashboard#links" className="hover:text-ink hover:underline">
                {unclaimed.length} {unclaimed.length === 1 ? "link" : "links"} without a name
              </Link>
            </p>
          )}
        </>
      }
    >
      <Composer me={me} />
      {/* Below a wide screen, the clients go above the feed, fewer of them. */}
      {clients.length > 0 && <ClientsRail clients={clients} show={3} className="lg:hidden" />}
      {sent.size === 0 ? (
        <FirstSend />
      ) : (
        <section aria-labelledby="stream-title">
          <h2 id="stream-title" className="px-1 text-lg font-semibold">
            Client activity
          </h2>
          <div className="mt-3">
            <ClientFeed cards={cards} me={me} />
          </div>
        </section>
      )}
    </HomeShell>
  );
}
