import { Loading, Placeholder } from "@/components/route-state";
import { cn } from "@/lib/format";
import { card } from "@/lib/ui";

// While the list of links is read, under the tabs (which stay): the shape of
// the heading, what's new and the first few links. Only this page: a client's
// page, or one that isn't theirs, settles first, so a 404 is still a 404.
export default function DashboardLoading() {
  return (
    <div aria-busy>
      <Loading what="your dashboard" />
      <div aria-hidden className="flex items-center justify-between gap-4">
        <Placeholder className="h-8 w-48" />
        <Placeholder className="h-12 w-32" />
      </div>
      <div aria-hidden className={cn(card, "mt-6 flex flex-col gap-4 p-5")}>
        <Placeholder className="h-6 w-32" />
        {[0, 1].map((line) => (
          <span key={line} className="flex items-center gap-3">
            <Placeholder className="size-9 shrink-0" />
            <span className="flex flex-1 flex-col gap-2">
              <Placeholder className="h-4 w-3/4" />
              <Placeholder className="h-3.5 w-1/3" />
            </span>
          </span>
        ))}
      </div>
      <ul aria-hidden className="mt-8 flex flex-col gap-3">
        {[0, 1, 2].map((row) => (
          <li key={row} className={cn(card, "flex flex-col gap-2.5 p-4")}>
            <Placeholder className="h-5 w-40" />
            <Placeholder className="h-4 w-2/3" />
            <Placeholder className="h-3.5 w-1/2" />
          </li>
        ))}
      </ul>
    </div>
  );
}
