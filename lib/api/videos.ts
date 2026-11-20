import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Listing } from "../listings/types";
import { VIDEO_MOST_BYTES } from "../own-listings";
import { videoLink } from "../video-link";
import { ApiError } from "./http";
import { checkPublicUrl, safeRequest, SafeRequestError, type SafeResponse } from "./safe-request";

// A video for one of an agent's own listings, from what a tool sent: a
// YouTube, Vimeo or Loom link (it plays in its own player, as one pasted on
// the Listings page does), or an https address straight to an MP4, MOV or
// WebM file, which plays from where it is. A file's address is checked
// first, from the public internet only: that it's there and is a video,
// and no bigger than a video uploaded on the site may be.

export const videoSchema = z.strictObject(
  { url: z.string().trim().min(1).max(2000) },
  { error: "Send “url”: a YouTube, Vimeo or Loom link, or an https link to an MP4, MOV or WebM file." },
);

const TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const WAIT_MS = 10_000;

const wrong = (message: string) => new ApiError(400, "invalid_request", message, "url");
const NOT_VIDEO =
  "That isn't a video we can play. Send a YouTube, Vimeo or Loom link, or an https link straight to an MP4, MOV or WebM file.";

// How big the file is, from what its server says (when it says).
function sizeOf(answer: SafeResponse) {
  const range = String(answer.headers["content-range"] ?? "").match(/\/(\d+)\s*$/);
  if (range) return Number(range[1]);
  const length = Number(answer.headers["content-length"]);
  return answer.status === 200 && Number.isFinite(length) && length > 0 ? length : null;
}

async function look(url: string, method: "HEAD" | "GET") {
  return safeRequest(url, {
    method,
    headers: { "User-Agent": "Porchcard-Videos/1", ...(method === "GET" ? { Range: "bytes=0-0" } : {}) },
    timeoutMs: WAIT_MS,
    maxBytes: 64 * 1024,
    // (Only its first bytes are wanted: the rest isn't waited for.)
    truncate: true,
  });
}

export async function videoFrom(raw: string): Promise<Listing["Media"][number]> {
  const url = raw.trim();
  const link = videoLink(url);
  if (link) {
    return {
      MediaKey: randomUUID(),
      MediaURL: url,
      Order: 0,
      MediaCategory: "Video",
      ShortDescription: `${link.site} video`,
      VideoEmbed: link.embed,
      ...(link.poster && { VideoPoster: link.poster }),
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw wrong(NOT_VIDEO);
  }
  if (parsed.username || parsed.password) throw wrong("Send the video's address without a name or password in it.");
  const blocked = checkPublicUrl(parsed.toString());
  if (blocked) throw wrong(blocked);
  if (parsed.protocol !== "https:" && process.env.API_WEBHOOKS_ALLOW_LOCAL !== "true") {
    throw wrong("The video's address must start with https://");
  }

  let answer: SafeResponse;
  try {
    answer = await look(parsed.toString(), "HEAD");
    // (Some servers won't answer HEAD: then just its first byte.)
    if (answer.status === 405 || answer.status === 501 || answer.status === 403) answer = await look(parsed.toString(), "GET");
  } catch (error) {
    if (error instanceof SafeRequestError) {
      if (error.code === "blocked") throw wrong(error.message);
      if (error.code === "timeout") throw wrong("The video's address didn't answer within 10 seconds.");
    }
    throw wrong("We couldn't reach the video at that address.");
  }
  if (answer.status >= 300 && answer.status < 400) {
    throw wrong("That address sends somewhere else. Send the video's own address, where it ends up.");
  }
  if (answer.status !== 200 && answer.status !== 206) throw wrong(`The video's address answered ${answer.status}.`);
  const type = String(answer.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (!TYPES.includes(type)) throw wrong(NOT_VIDEO);
  const size = sizeOf(answer);
  if (size !== null && size > VIDEO_MOST_BYTES) throw wrong("Videos can be up to 50 MB. Send a smaller one, or a YouTube link.");

  return { MediaKey: randomUUID(), MediaURL: parsed.toString(), Order: 0, MediaCategory: "Video", ShortDescription: "Video" };
}
