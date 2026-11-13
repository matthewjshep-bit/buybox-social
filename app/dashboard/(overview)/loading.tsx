import { Loading, Placeholder } from "@/components/route-state";
import { cn } from "@/lib/format";
import { card } from "@/lib/ui";

// While the clients are read, under the tabs (which stay): the shape of the
// heading, the counts and the first few clients. Only this page: a client's
// page, or one that isn't theirs, settles first, so a 404 is still a 404.
export default function DashboardLoading() {
  return (
    <div aria-busy>
      <Loading what="your dashboard" />
      <div aria-hidden className="flex items-center justify-between gap-4">
        <Placeholder className="h-8 w-48" />
        <Placeholder className="h-12 w-36" />
      </div>
      <div aria-hidden className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[0, 1, 2, 3].map((tile) => (
          <span key={tile} className={cn(card, "flex flex-col gap-2 p-3")}>
            <Placeholder className="h-7 w-10" />
            <Placeholder className="h-3.5 w-24" />
          </span>
        ))}
      </div>
      <ul aria-hidden className="mt-5 flex flex-col gap-3">
        {[0, 1, 2].map((row) => (
          <li key={row} className={cn(card, "flex gap-3 p-4")}>
            <Placeholder className="size-10 shrink-0 rounded-full" />
            <span className="flex flex-1 flex-col gap-2.5">
              <Placeholder className="h-5 w-40" />
              <Placeholder className="h-4 w-2/3" />
              <span className="flex gap-2">
                {[0, 1, 2].map((thumb) => (
                  <Placeholder key={thumb} className="size-14" />
                ))}
              </span>
              <Placeholder className="h-3.5 w-1/2" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
