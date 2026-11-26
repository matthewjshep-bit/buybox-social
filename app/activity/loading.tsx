import { Loading, Placeholder } from "@/components/route-state";
import { cn } from "@/lib/format";
import { card, pageColumn, pageTitle } from "@/lib/ui";

// While the bell's page is read: its heading, then the shape of a few lines,
// in one card as the lines are.
export default function ActivityLoading() {
  return (
    <main aria-busy className={pageColumn()}>
      <h1 className={pageTitle}>Notifications</h1>
      <Loading what="your notifications" />
      <Placeholder className="mt-5 h-4 w-20" />
      <ul aria-hidden className={cn(card, "mt-3 divide-y divide-stone-100 overflow-hidden")}>
        {[0, 1, 2, 3].map((row) => (
          <li key={row} className="flex items-start gap-3 px-3 py-3 sm:px-4">
            <Placeholder className="size-10 shrink-0" />
            <span className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
              <Placeholder className="h-4 w-4/5" />
              <Placeholder className="h-3.5 w-1/2" />
            </span>
            <Placeholder className="size-12 shrink-0 rounded-xl" />
          </li>
        ))}
      </ul>
    </main>
  );
}
