import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { FollowText } from "@/components/home/follow-text";
import { cn } from "@/lib/format";
import type { AgentClient } from "@/lib/clients";
import type { FeedWho, FollowedFace } from "@/lib/home-feed";
import type { MyLink } from "@/lib/my-links";

// The row of faces along the top of the home, as a phone's stories are: for
// an agent, their clients (a ring when there's something new, a green dot
// when they're on their link right now), each opening that client's homes;
// for anyone else, their agent first, then the people they follow, each
// opening what that person has liked. It scrolls sideways on its own, never
// the page.

const ROW = "-mx-4 flex snap-x gap-3.5 overflow-x-auto px-4 pb-1 pt-1.5 [scrollbar-width:none] lg:mx-0 lg:px-0.5";

// A face, 60px: their photo, or their initial; split down the middle for two
// people on one link.
function Face({ people, tone = "person" }: { people: { name: string; photo: string | null }[]; tone?: "person" | "agent" }) {
  const halves = people.slice(0, 2);
  const fill = tone === "agent" ? "bg-ink text-white" : "bg-brand text-white";
  return (
    <span aria-hidden className="flex size-[60px] shrink-0 overflow-hidden rounded-full bg-stone-200">
      {halves.map((person, i) =>
        person.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={person.photo}
            alt=""
            className={cn("h-full object-cover", halves.length > 1 ? "w-1/2" : "w-full", i > 0 && "border-l-2 border-white")}
          />
        ) : (
          <span
            key={i}
            className={cn(
              "flex h-full items-center justify-center font-semibold",
              halves.length > 1 ? "w-1/2 text-base" : "w-full text-[22px]",
              i > 0 ? "border-l-2 border-white bg-ink text-white" : fill,
            )}
          >
            {person.name.trim()[0]?.toUpperCase() ?? "?"}
          </span>
        ),
      )}
    </span>
  );
}

// One face in the row: a ring around it (the colour of what's new, else a
// quiet grey), its name under it, and a mark on its corner when there is one.
function Bubble({
  href,
  label,
  name,
  ring,
  ringColor,
  corner,
  children,
}: {
  href: string;
  label: string;
  name: string;
  ring: "new" | "quiet";
  // A ring in someone's own colour (their agent's brand), in place of the site's.
  ringColor?: string | null;
  corner?: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="w-16 shrink-0 snap-start">
      <Link href={href} aria-label={label} className="group flex flex-col items-center gap-1 rounded-xl focus-visible:outline-offset-2">
        <span
          className={cn(
            "relative rounded-full p-[3px]",
            ring === "new" ? "ring-[2.5px] ring-brand" : "ring-1 ring-stone-300",
          )}
          style={ring === "new" && ringColor ? ({ "--tw-ring-color": ringColor } as CSSProperties) : undefined}
        >
          {children}
          {corner}
        </span>
        <span className="w-full truncate text-center text-[12px] leading-4 text-ink group-hover:underline">{name}</span>
      </Link>
    </li>
  );
}

// On their link right now: a green dot, which breathes a moment unless they
// asked for less motion.
const ActiveDot = () => (
  <span
    aria-hidden
    className="absolute bottom-0.5 right-0.5 size-3.5 rounded-full bg-emerald-500 ring-2 ring-white motion-safe:animate-pulse"
  />
);

// "Send": the way to send homes to anyone, first in an agent's row (the only
// way on a phone, where there's no composer).
function SendBubble() {
  return (
    <li className="w-16 shrink-0 snap-start">
      <Link
        href="/dashboard/new?focus=to"
        aria-label="Send homes"
        className="group flex flex-col items-center gap-1 rounded-xl focus-visible:outline-offset-2"
      >
        <span className="flex size-[66px] items-center justify-center rounded-full border-2 border-dashed border-stone-300 bg-white text-brand group-hover:border-brand">
          <Plus aria-hidden size={24} />
        </span>
        <span className="text-[12px] leading-4 group-hover:underline">Send</span>
      </Link>
    </li>
  );
}

// The people on a client's link, once each by name.
const peopleOf = (client: AgentClient) => {
  const seen = new Set<string>();
  return client.people.filter((person) => {
    const name = person.name.trim().toLowerCase();
    if (!name || seen.has(name)) return false;
    seen.add(name);
    return true;
  });
};

// Which link a client's page is about (its address ends with the link's id).
export const shareOf = (client: AgentClient) => client.href.split("/").pop() ?? client.shareIds[0];

// Where a client's face goes: one person's homes across every link they're
// on, or a shared link's homes with everyone's take on them.
export function clientReel(client: AgentClient) {
  const people = peopleOf(client);
  return people.length === 1
    ? `/reel?${new URLSearchParams({ from: `client:${people[0].participantId}` })}`
    : `/reel?${new URLSearchParams({ from: `share:${shareOf(client)}` })}`;
}

// What a client is called on their face: their first name, or the link's
// name for a link shared by several ("Ben & Nina").
export function clientName(client: AgentClient) {
  const people = peopleOf(client);
  return people.length === 1 ? people[0].name.trim() : client.name;
}

// The order faces come in: anyone on their link right now, then anyone with
// something new, then whoever was busy most recently.
export function inFaceOrder(clients: AgentClient[]) {
  const last = (c: AgentClient) => (c.lastActivity ?? c.openedAt ?? c.sentAt).getTime();
  return [...clients].sort(
    (a, b) => Number(b.activeNow) - Number(a.activeNow) || Number(b.unread) - Number(a.unread) || last(b) - last(a),
  );
}

// An agent's clients: "+ Send", then up to 12 faces, then See all.
export function ClientFaces({ clients }: { clients: AgentClient[] }) {
  // A face is a person: a link nobody's on yet ("Link for 35 …") has none.
  const shown = inFaceOrder(clients.filter((client) => peopleOf(client).some((person) => person.name.trim()))).slice(0, 12);
  return (
    <nav aria-label="Your clients">
      <ul className={ROW}>
        <SendBubble />
        {shown.map((client) => {
          const name = clientName(client);
          const people = peopleOf(client);
          const label = [name, client.unread && "new activity", client.activeNow && "active now"].filter(Boolean).join(", ");
          return (
            <Bubble
              key={client.key}
              href={clientReel(client)}
              label={label}
              name={name}
              ring={client.unread ? "new" : "quiet"}
              corner={client.activeNow ? <ActiveDot /> : null}
            >
              <Face people={people.length ? people : [{ name, photo: null }]} />
            </Bubble>
          );
        })}
        {clients.length > 0 && (
          <li className="w-16 shrink-0 snap-start">
            <Link
              href="/dashboard"
              className="group flex flex-col items-center gap-1 rounded-xl focus-visible:outline-offset-2"
            >
              <span className="flex size-[66px] items-center justify-center rounded-full bg-stone-100 text-ink ring-1 ring-stone-300 group-hover:bg-stone-200">
                <ArrowRight aria-hidden size={22} />
              </span>
              <span className="text-[12px] leading-4 group-hover:underline">See all</span>
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}

// A buyer's agents, once each: the newest link from each.
const agentsOf = (links: MyLink[]) => {
  const seen = new Set<string>();
  return links.filter((link) => {
    const id = link.agent.profileId ?? link.agent.name;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

// Whether something happened in the last seven days.
const thisWeek = (at: string | null, now = Date.now()) => Boolean(at && +new Date(at) > now - 7 * 86_400_000);

// Someone's row: their agent first (ringed in the agent's colour when there
// are homes to rate or a reply they haven't seen), then the people they
// follow (ringed when they've liked or said something since this page was
// last open). With nobody yet, a few people worth following.
export function PeopleFaces({
  links,
  brands,
  followed,
  seenAt,
  suggestions,
}: {
  links: MyLink[];
  // Each agent's own colour, by their page's id.
  brands: Record<string, string>;
  followed: FollowedFace[];
  seenAt: string | null;
  suggestions: (FeedWho & { profileId: string })[];
}) {
  const agents = agentsOf(links);
  const agentIds = new Set(agents.flatMap((link) => (link.agent.profileId ? [link.agent.profileId] : [])));
  const people = followed.filter((person) => !agentIds.has(person.profileId)).slice(0, Math.max(0, 15 - agents.length));
  const isNew = (at: string | null) => Boolean(at && (!seenAt || at > seenAt));

  if (agents.length === 0 && people.length === 0) {
    if (suggestions.length === 0) return null;
    return (
      <section aria-labelledby="taste-people-title">
        <h2 id="taste-people-title" className="px-1 text-meta font-semibold text-muted">
          People with your taste
        </h2>
        <ul className={cn(ROW, "mt-1 gap-4")}>
          {suggestions.slice(0, 4).map((person) => (
            <li key={person.profileId} className="flex w-[76px] shrink-0 snap-start flex-col items-center gap-1">
              <Link
                href={`/people/${person.profileId}`}
                className="flex flex-col items-center gap-1 rounded-xl focus-visible:outline-offset-2"
              >
                <span className="rounded-full p-[3px] ring-1 ring-stone-300">
                  <Face people={[{ name: person.face || person.name, photo: person.photo }]} tone={person.agent ? "agent" : "person"} />
                </span>
                <span className="w-[76px] truncate text-center text-[12px] leading-4">{person.name}</span>
              </Link>
              <FollowText personId={person.profileId} name={person.name} />
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <nav aria-label="People">
      <ul className={ROW}>
        {agents.map((link) => {
          const fresh = link.unrated > 0 || isNew(link.latestAgentReply?.at ?? null);
          const name = link.agent.firstName || link.agent.name;
          const label = [
            `${name}, your agent`,
            link.unrated > 0 && `${link.unrated} ${link.unrated === 1 ? "home" : "homes"} to see`,
            !link.unrated && fresh && "new reply",
          ]
            .filter(Boolean)
            .join(", ");
          return (
            <Bubble
              key={link.shareId}
              href={`/s/${link.token}`}
              label={label}
              name={name}
              ring={fresh ? "new" : "quiet"}
              ringColor={link.agent.profileId ? brands[link.agent.profileId] : null}
              corner={
                <span
                  aria-hidden
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-ink px-1.5 text-[10px] font-bold uppercase leading-4 tracking-wide text-white ring-2 ring-white"
                >
                  Agent
                </span>
              }
            >
              <Face people={[{ name, photo: link.agent.photo }]} tone="agent" />
            </Bubble>
          );
        })}
        {people.map((person) => {
          const fresh = isNew(person.lastAt) && thisWeek(person.lastAt);
          return (
            <Bubble
              key={person.profileId}
              href={`/reel?${new URLSearchParams({ from: person.profileId })}`}
              label={fresh ? `${person.name}, something new` : person.name}
              name={person.name}
              ring={fresh ? "new" : "quiet"}
            >
              <Face people={[{ name: person.face || person.name, photo: person.photo }]} tone={person.agent ? "agent" : "person"} />
            </Bubble>
          );
        })}
      </ul>
    </nav>
  );
}
