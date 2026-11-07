"use client";

// Past the header to what the page is about. Where the homes carry their own
// header, floating over them as the start of the page's main part, that's the
// homes just after it: the next Tab is in the first one. (Without scripts, the
// page's main part.)
export function SkipLink() {
  return (
    <a
      href="#main"
      onClick={(event) => {
        const homes = document.querySelector<HTMLElement>("#main [data-reel-header] + [data-reel]");
        if (!homes) return;
        event.preventDefault();
        homes.focus({ preventScroll: true });
      }}
      className="sr-only z-50 rounded-full bg-ink px-5 py-3 font-semibold text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
    >
      Skip to main content
    </a>
  );
}
