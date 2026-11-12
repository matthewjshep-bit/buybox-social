import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page here is per-user and dynamic, so there is nothing to prerender.
  cacheComponents: false,
  partialPrefetching: false,
  experimental: {
    // A warm build cache on Vercel kept Tailwind's old list of classes, so new
    // styles (the dark words block, the desktop layout) were missing from the
    // live CSS. Every build starts clean instead: slower, but always right.
    turbopackFileSystemCacheForBuild: false,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // One address for everything: the old one forwards to Porchcard's, page and
  // query and all (a sign-in link's too), so no one is signed in at one and
  // not the other. Temporary, so it can still be changed.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "buybox-social.vercel.app" }],
        destination: "https://www.porchcard.com/:path*",
        permanent: false,
      },
    ];
  },
  async headers() {
    // A link preview's picture is the same for everyone who opens the link,
    // and a chat app may ask for it again with every paste: kept for a day.
    const keepADay = [{ key: "Cache-Control", value: "public, max-age=86400" }];
    // A share link's token is its only credential: keep it out of search
    // engines and out of Referer headers.
    return [
      {
        source: "/s/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      { source: "/s/:token/opengraph-image/:id", headers: keepADay },
      { source: "/homes/:key/opengraph-image", headers: keepADay },
    ];
  },
};

export default nextConfig;
