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
      // (Its padding comes with focus: shown, it's a button, not a strip of
      // words. A plain padding would lose to not-sr-only's.)
      className="sr-only z-50 rounded-full bg-ink font-semibold text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-[calc(env(safe-area-inset-top)+0.5rem)] focus:px-5 focus:py-3 focus:shadow-lg"
    >
      Skip to main content
    </a>
  );
}
