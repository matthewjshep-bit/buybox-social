// A video on someone else's site, from the link to it: how it's shown inside
// the page (its player's address), and a still to show before it plays where
// the site gives one. YouTube, Vimeo and Loom; anything else is null.
export type VideoLink = { embed: string; poster: string | null; site: "YouTube" | "Vimeo" | "Loom" };

const ID = /^[\w-]{6,40}$/;

export function videoLink(raw: string): VideoLink | null {
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.replace(/^(www|m)\./, "").toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be" || host === "youtube.com" || host === "youtube-nocookie.com") {
    const id =
      host === "youtu.be"
        ? parts[0]
        : parts[0] === "watch"
          ? url.searchParams.get("v")
          : ["shorts", "embed", "live"].includes(parts[0] ?? "")
            ? parts[1]
            : null;
    if (!id || !ID.test(id)) return null;
    return { site: "YouTube", embed: `https://www.youtube-nocookie.com/embed/${id}`, poster: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const at = parts[0] === "video" ? 1 : 0;
    const id = parts[at];
    if (!id || !/^\d{5,12}$/.test(id)) return null;
    // (An unlisted video's link carries a second part, which its player needs.)
    const hash = parts[at + 1] && /^[0-9a-f]{6,20}$/i.test(parts[at + 1]) ? parts[at + 1] : url.searchParams.get("h");
    return { site: "Vimeo", embed: `https://player.vimeo.com/video/${id}${hash && /^[0-9a-f]{6,20}$/i.test(hash) ? `?h=${hash}` : ""}`, poster: null };
  }
  if (host === "loom.com") {
    const id = ["share", "embed"].includes(parts[0] ?? "") ? parts[1] : null;
    if (!id || !/^[0-9a-f]{20,40}$/i.test(id)) return null;
    return { site: "Loom", embed: `https://www.loom.com/embed/${id}`, poster: null };
  }
  return null;
}
