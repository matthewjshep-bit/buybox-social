import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page here is per-user and dynamic, so there is nothing to prerender.
  cacheComponents: false,
  partialPrefetching: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
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
