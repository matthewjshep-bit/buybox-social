import Link from "next/link";
import { clipSaid, SAID_LINE } from "@/lib/profile";

// What someone said, in the line at the top of a card, after their name:
// "replied to Sam “…”", "commented on the price “…”" (a fact has no photo to
// show it), or "commented “…”" (the photo shows the spot, if it's about one).
// The same words on their page and in a feed. A long one is cut short so the
// whole line, with `around` letters of name and time, is about three lines:
// the time after it always shows. A screen reader hears all of it.

export type Said = {
  body: string;
  replyTo?: { name: string; profileId: string } | null;
  spot?: { name: string; fact: boolean } | null;
};

export function SaidLine({ said, around }: { said: Said; around: number }) {
  const verb = said.replyTo
    ? `replied to ${said.replyTo.name}`
    : said.spot?.fact
      ? `commented on ${said.spot.name}`
      : "commented";
  const whole = said.body.replace(/\s+/g, " ").trim();
  // (Less the quote marks and the spaces round them.)
  const shown = clipSaid(whole, SAID_LINE - around - verb.length - 4);
  return (
    <>
      {said.replyTo ? (
        <>
          replied to{" "}
          <Link
            href={`/people/${said.replyTo.profileId}`}
            className="relative z-20 font-semibold underline-offset-2 before:absolute before:-inset-x-1 before:-inset-y-[13px] hover:underline"
          >
            {said.replyTo.name}
          </Link>
        </>
      ) : (
        verb
      )}{" "}
      {shown === whole ? (
        <span data-said>&ldquo;{whole}&rdquo;</span>
      ) : (
        <>
          <span data-said aria-hidden>
            &ldquo;{shown}&rdquo;
          </span>
          <span className="sr-only">&ldquo;{whole}&rdquo;</span>
        </>
      )}
    </>
  );
}
