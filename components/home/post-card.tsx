"use client";

import Link from "next/link";
import { useRef, useState, type CSSProperties } from "react";
import { deleteMyPost, changeMyPost } from "@/app/send/actions";
import { FeedBar } from "@/components/home/feed-bar";
import { HomeSwipe } from "@/components/home-swipe";
import { EditBox, OwnMenu } from "@/components/own-words";
import { PhotoSwipe } from "@/components/photo-swipe";
import { Avatar, Badge } from "@/components/ui";
import { cn, formatPrice, timeAgo } from "@/lib/format";
import type { FeedCounts } from "@/lib/home-feed";
import type { PostEntry } from "@/lib/posts";
import type { ReactionState } from "@/lib/reactions";
import { card } from "@/lib/ui";

// A post in a feed, or on its author's page, shaped like a post anywhere:
// who, when, their words; then the home it's about, large, with its photos
// a swipe away, or several homes to swipe through (each named on its photo);
// the facts of the one showing in a line; and under it the bar every feed
// card has (how many liked that home, how many comments, which unfurl right
// there). With no home: the words alone. Your own has "…" in its corner:
// Edit its words, or Delete it, right where it is.

// A photo's shape, kept between a little taller than wide and three by two.
const shapeOf = (photo: { width?: number; height?: number }) =>
  Math.min(3 / 2, Math.max(4 / 5, photo.width && photo.height ? photo.width / photo.height : 4 / 3));

export function PostCard({
  entry,
  reelFrom,
  isMe = false,
  mine,
  counts,
  own = false,
}: {
  entry: PostEntry;
  // Where the homes open full screen (`/reel?from=`).
  reelFrom: string;
  // Their own post, on their own page: "You".
  isMe?: boolean;
  // The viewer's own take on each home, and how many liked each and how
  // many comments it has, by key, for the bar.
  mine: Record<string, ReactionState>;
  counts: Record<string, FeedCounts>;
  // The viewer's own: theirs to change or delete.
  own?: boolean;
}) {
  const { who, homes } = entry;
  const [shown, setShown] = useState(0);
  // As it stands since it was changed here (the feed doesn't reload under it).
  const [body, setBody] = useState(entry.body);
  const [edited, setEdited] = useState(entry.edited);
  const [editing, setEditing] = useState(false);
  const [gone, setGone] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const backToMenu = () => requestAnimationFrame(() => more.current?.focus({ preventScroll: true }));
  const home = homes[Math.min(shown, homes.length - 1)];
  const reel = (key: string, photo?: number | null) =>
    `/reel?${new URLSearchParams({ from: reelFrom, home: key, ...(photo != null && { photo: String(photo) }) })}`;
  const sentence = homes.length === 0 ? "posted" : homes.length === 1 ? "posted about this home" : `posted ${homes.length} homes`;
  const time = timeAgo(entry.at);
  if (gone) return null;
  return (
    <li className={cn(card, "relative overflow-hidden")} data-post={entry.postId} data-item={entry.id}>
      <div className="flex items-start gap-3 p-3.5">
        <Avatar name={who.face || who.name} tone={who.agent ? "agent" : "person"} photo={who.photo} size={9} />
        <p data-card-line className="min-w-0 flex-1 pt-1 text-body leading-snug">
          {who.profileId && !isMe ? (
            <Link href={`/people/${who.profileId}`} className="relative z-20 font-semibold underline-offset-2 hover:underline">
              {who.name}
            </Link>
          ) : (
            <strong className="font-semibold">{isMe ? "You" : who.name}</strong>
          )}{" "}
          {sentence}
          {/* Held to the last word (a space that doesn't break), so the time
              never starts a line on its own. */}
          {"\u00a0"}
          <span className="whitespace-nowrap text-meta text-muted">
            {"· "}
            <time dateTime={entry.at} suppressHydrationWarning>
              {time}
            </time>
            {edited && " · Edited"}
          </span>
        </p>
        {own && (
          <OwnMenu
            big
            what="post"
            triggerRef={more}
            warn="It comes off your page, the feeds, and each home's comments."
            onEdit={() => setEditing(true)}
            onDelete={async () => {
              const result = await deleteMyPost(entry.postId);
              if (!result.ok) return result.error;
              setGone(true);
              return null;
            }}
            className="relative z-20 -my-1.5 -mr-2 shrink-0"
          />
        )}
      </div>
      {editing ? (
        <div className="relative z-20 -mt-1 px-3.5 pb-3">
          <EditBox
            initial={body}
            what="post"
            enterSaves={false}
            allowEmpty={homes.length > 0}
            onCancel={() => {
              setEditing(false);
              backToMenu();
            }}
            onSave={async (next) => {
              const result = await changeMyPost(entry.postId, next);
              if (!result.ok) return result.error;
              setBody(next);
              setEdited(true);
              setEditing(false);
              backToMenu();
              return null;
            }}
          />
        </div>
      ) : (
        body && <p className="-mt-1 whitespace-pre-line break-words px-3.5 pb-3 text-body leading-snug">{body}</p>
      )}
      {homes.length === 1 && home.photos.length > 0 && (
        <PhotoSwipe
          photos={home.photos}
          total={home.photoCount}
          href={reel(home.key, home.photo?.index)}
          label={home.address}
          sizes="(min-width: 1024px) 600px, 100vw"
          // At its own shape at every width, never taller than 32rem.
          style={{ "--shape": String(shapeOf(home.photos[0])) } as CSSProperties}
          className="aspect-(--shape) max-h-[32rem] w-full bg-stone-100"
        />
      )}
      {homes.length > 1 && (
        <HomeSwipe
          homes={homes.map((h) => ({ key: h.key, href: reel(h.key), address: h.address, price: h.price, photo: h.photo }))}
          label={`${who.name}'s post`}
          sizes="(min-width: 1024px) 600px, 100vw"
          onShown={setShown}
          className="aspect-[4/3] max-h-[32rem] w-full"
        />
      )}
      {home && (
        <>
          {/* The facts of the home showing, in a line: the price large, the rest after it. */}
          <Link href={reel(home.key)} data-card-link={`${entry.id}:${home.key}`} className="block px-3.5 pt-3 hover:underline">
            <span className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="font-display text-xl font-semibold">{formatPrice(home.price)}</span>
              <span className="text-body text-stone-700">
                · {home.beds} bd · {home.baths} ba · {home.sqft.toLocaleString("en-US")} sq ft
              </span>
              {!home.active && <Badge className="self-center">Off market</Badge>}
            </span>
            <span className="block truncate text-meta text-muted">
              {home.address}, {home.city}
            </span>
          </Link>
          <FeedBar
            key={home.key}
            listingKey={home.key}
            address={home.address}
            counts={counts[home.key] ?? { likes: 0, comments: 0 }}
            mine={mine[home.key] ?? null}
            active={home.active}
            reelHref={reel(home.key)}
          />
        </>
      )}
      <div className={homes.length > 0 ? "h-1" : "h-2"} />
    </li>
  );
}
