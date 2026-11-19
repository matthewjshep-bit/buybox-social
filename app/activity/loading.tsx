import { Loading, Placeholder } from "@/components/route-state";
import { cn } from "@/lib/format";
import { card, pageColumn, pageTitle } from "@/lib/ui";

// While the bell's page is read: its heading, then the shape of a few lines.
export default function ActivityLoading() {
  return (
    <main aria-busy className={pageColumn()}>
      <h1 className={pageTitle}>Notifications</h1>
      <Loading what="your notifications" />
      <Placeholder className="ml-1 mt-4 h-4 w-20" />
      <ul aria-hidden className="mt-3 flex flex-col gap-2">
        {[0, 1, 2].map((row) => (
          <li key={row} className={cn(card, "flex items-center gap-3 p-3")}>
            <Placeholder className="size-10 shrink-0" />
            <span className="flex min-w-0 flex-1 flex-col gap-2">
              <Placeholder className="h-4 w-4/5" />
              <Placeholder className="h-3.5 w-1/2" />
              <Placeholder className="h-3 w-16" />
            </span>
            <Placeholder className="size-12 shrink-0 rounded-xl" />
          </li>
        ))}
      </ul>
    </main>
  );
}
