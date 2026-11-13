import { Loading, Placeholder } from "@/components/route-state";
import { cn } from "@/lib/format";
import { card } from "@/lib/ui";

// While the clients are read, under the tabs (which stay): the shape of the
// heading, the filters and the first few people. Only this page: a client's
// page, or one that isn't theirs, settles first, so a 404 is still a 404.
export default function DashboardLoading() {
  return (
    <div aria-busy>
      <Loading what="your clients" />
      <div aria-hidden className="flex items-center justify-between gap-4">
        <span className="flex flex-col gap-2">
          <Placeholder className="h-8 w-36" />
          <Placeholder className="h-3.5 w-24" />
        </span>
        <Placeholder className="h-12 w-36" />
      </div>
      <div aria-hidden className="mt-5 flex gap-2">
        {[0, 1, 2, 3, 4].map((pill) => (
          <Placeholder key={pill} className="h-10 w-24 rounded-full" />
        ))}
      </div>
      <ul aria-hidden className={cn(card, "mt-4 divide-y divide-stone-200")}>
        {[0, 1, 2].map((row) => (
          <li key={row} className="flex flex-col gap-3 p-4">
            <span className="flex gap-3">
              <Placeholder className="size-10 shrink-0 rounded-full" />
              <span className="flex flex-1 flex-col gap-2">
                <Placeholder className="h-5 w-40" />
                <Placeholder className="h-3.5 w-1/2" />
              </span>
            </span>
            <Placeholder className="h-12 w-full" />
            <Placeholder className="h-10 w-2/3" />
          </li>
        ))}
      </ul>
    </div>
  );
}
