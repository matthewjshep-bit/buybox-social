"use client";

import { ImagePlus, Play, Star, Trash2, Upload } from "lucide-react";
import Image from "next/image";
import { useId, useState, useTransition } from "react";
import { cn } from "@/lib/format";
import { listingPhoto } from "@/lib/resize-photo";
import { button } from "@/lib/ui";
import {
  addListingPhoto,
  addListingVideoLink,
  deleteListing,
  finishListingVideoUpload,
  leadWithListingPhoto,
  removeListingPhoto,
  startListingVideoUpload,
} from "./actions";

type Photo = { key: string; url: string };

// A listing's photos: add some (several at once), choose which leads (the
// one its card shows), take one away. Each is made small in the browser and
// sent on its own, so a slow connection loses one photo at most.
export function ListingPhotos({ listingKey, photos, most }: { listingKey: string; photos: Photo[]; most: number }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ done: number; of: number } | null>(null);
  const fileId = useId();
  const full = photos.length >= most;

  const add = (files: File[]) =>
    startTransition(async () => {
      setError(null);
      const room = files.slice(0, most - photos.length);
      for (const [i, file] of room.entries()) {
        setAdding({ done: i, of: room.length });
        try {
          const photo = await listingPhoto(file);
          const result = await addListingPhoto(listingKey, photo.dataUrl, photo.width, photo.height);
          if (result.error) {
            setError(result.error);
            break;
          }
        } catch {
          setError(`We couldn't read ${file.name}. Try a JPEG or PNG.`);
        }
      }
      if (files.length > room.length) setError(`A listing can have up to ${most} photos.`);
      setAdding(null);
    });
  const act = (run: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const result = await run();
      setError(result.error ?? null);
    });

  return (
    <div>
      {photos.length > 0 && (
        <ul aria-label="Photos" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo, i) => (
            <li key={photo.key}>
              <span className={cn("relative block aspect-[4/3] overflow-hidden rounded-xl bg-stone-200", i === 0 && "ring-2 ring-brand")}>
                <Image src={photo.url} alt={`Photo ${i + 1}`} fill sizes="(min-width: 640px) 220px, 50vw" className="object-cover" />
                {i === 0 && (
                  <span className="absolute left-2 top-2 rounded-full bg-brand px-2 py-0.5 text-tiny font-semibold text-white">First</span>
                )}
              </span>
              <div className="mt-1 flex items-center justify-between">
                {i > 0 ? (
                  <button
                    type="button"
                    disabled={pending}
                    aria-label={`Make photo ${i + 1} first`}
                    onClick={() => act(() => leadWithListingPhoto(listingKey, photo.key))}
                    className="inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-sm font-semibold text-stone-700 hover:bg-black/5"
                  >
                    <Star aria-hidden size={15} /> Make first
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  disabled={pending}
                  aria-label={`Remove photo ${i + 1}`}
                  onClick={() => act(() => removeListingPhoto(listingKey, photo.key))}
                  className="grid size-11 place-items-center rounded-full text-stone-600 hover:bg-black/5 hover:text-red-700"
                >
                  <Trash2 aria-hidden size={17} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className={cn("flex flex-wrap items-center gap-3", photos.length > 0 && "mt-2")}>
        <label
          htmlFor={fileId}
          aria-disabled={pending || full}
          className={cn(
            button({ kind: photos.length ? "secondary" : "primary", size: "lg" }),
            "cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand aria-disabled:cursor-not-allowed aria-disabled:opacity-60",
          )}
        >
          <ImagePlus aria-hidden size={18} />
          {adding ? `Adding ${adding.done + 1} of ${adding.of}…` : "Add photos"}
          <input
            id={fileId}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={pending || full}
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              event.target.value = "";
              if (files.length) add(files);
            }}
          />
        </label>
        <p className="text-meta text-muted">
          {photos.length} of {most}
        </p>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

// Taking the whole listing away, asked twice: a second tap on the same button.
export function DeleteListing({ listingKey }: { listingKey: string }) {
  const [sure, setSure] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!sure) return setSure(true);
          startTransition(async () => {
            const result = await deleteListing(listingKey);
            setError(result?.error ?? null);
            setSure(false);
          });
        }}
        className={cn(button({ kind: "ghost" }), "text-red-700")}
      >
        <Trash2 aria-hidden size={16} /> {pending ? "Deleting…" : sure ? "Tap again to delete it" : "Delete this listing"}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-sm text-stone-700">
          {error}
        </p>
      )}
    </div>
  );
}

type Video = { key: string; label: string; poster: string | null };

// A listing's videos: one on YouTube, Vimeo or Loom by its link, or one from
// their device (where there's file storage to hold it), a few at most. They
// play with the photos, after them.
export function ListingVideos({
  listingKey,
  videos,
  most,
  canUpload,
  mostBytes,
}: {
  listingKey: string;
  videos: Video[];
  most: number;
  // There's file storage here to upload into.
  canUpload: boolean;
  mostBytes: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileId = useId();
  const linkId = useId();
  const full = videos.length >= most;

  const addLink = () =>
    startTransition(async () => {
      const result = await addListingVideoLink(listingKey, link);
      setError(result.error ?? null);
      if (!result.error) setLink("");
    });

  // Straight from this browser to file storage, then onto the listing.
  const upload = (file: File) =>
    startTransition(async () => {
      setError(null);
      if (file.size > mostBytes) return setError("Videos can be up to 50 MB. Trim it, or paste a link instead.");
      setUploading(true);
      try {
        const start = await startListingVideoUpload(listingKey, file.type, file.size);
        if ("error" in start) return setError(start.error);
        const { createClient } = await import("@supabase/supabase-js");
        const storage = createClient(start.url, start.anonKey, { auth: { persistSession: false, autoRefreshToken: false } }).storage;
        const sent = await storage.from(start.bucket).uploadToSignedUrl(start.path, start.token, file, { contentType: file.type });
        if (sent.error) return setError("The upload didn't finish. Try again, or paste a link instead.");
        const done = await finishListingVideoUpload(listingKey, start.path);
        setError(done.error ?? null);
      } catch {
        setError("The upload didn't finish. Try again, or paste a link instead.");
      } finally {
        setUploading(false);
      }
    });

  return (
    <div>
      {videos.length > 0 && (
        <ul aria-label="Videos" className="mb-3 flex flex-col gap-2">
          {videos.map((video, i) => (
            <li key={video.key} className="flex items-center gap-3 rounded-xl bg-stone-50 p-2 ring-1 ring-stone-200">
              <span className="relative grid h-12 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-stone-800">
                {video.poster && (
                  // A still from the video's own site, shown as it is.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={video.poster} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />
                )}
                <Play aria-hidden size={16} className="relative fill-white text-white" />
              </span>
              <span className="min-w-0 flex-1 truncate text-body font-semibold">{video.label}</span>
              <button
                type="button"
                disabled={pending}
                aria-label={`Remove video ${i + 1}`}
                onClick={() =>
                  startTransition(async () => {
                    const result = await removeListingPhoto(listingKey, video.key);
                    setError(result.error ?? null);
                  })
                }
                className="grid size-11 shrink-0 place-items-center rounded-full text-stone-600 hover:bg-black/5 hover:text-red-700"
              >
                <Trash2 aria-hidden size={17} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!full && (
        <div className="flex flex-col gap-3">
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (link.trim()) addLink();
            }}
          >
            <div className="min-w-0 flex-1">
              <label htmlFor={linkId} className="block text-sm font-semibold">
                Video link
              </label>
              <input
                id={linkId}
                type="url"
                inputMode="url"
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder="YouTube, Vimeo or Loom"
                autoComplete="off"
                maxLength={300}
                className="mt-1 h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-body text-ink placeholder:text-stone-500 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              />
            </div>
            <button type="submit" disabled={pending || !link.trim()} className={cn(button({ kind: "secondary" }), "shrink-0")}>
              Add
            </button>
          </form>
          {canUpload && (
            <div className="flex flex-wrap items-center gap-3">
              <label
                htmlFor={fileId}
                aria-disabled={pending}
                className={cn(
                  button({ kind: "secondary" }),
                  "cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand aria-disabled:cursor-not-allowed aria-disabled:opacity-60",
                )}
              >
                <Upload aria-hidden size={16} /> {uploading ? "Uploading…" : "Upload a video"}
                <input
                  id={fileId}
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  className="sr-only"
                  disabled={pending}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) upload(file);
                  }}
                />
              </label>
              <p className="text-meta text-muted">Up to 50 MB</p>
            </div>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
