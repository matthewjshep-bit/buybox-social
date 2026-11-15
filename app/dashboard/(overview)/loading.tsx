import { Loading, Placeholder } from "@/components/route-state";
import { cn } from "@/lib/format";
import { card } from "@/lib/ui";

// While the clients are read, under the tabs (which stay): the shape of the
// heading and the first few clients. Only this page: a client's page, or one
// that isn't theirs, settles first, so a 404 is still a 404.
export default function DashboardLoading() {
  return (
    <div aria-busy>
      <Loading what="your clients" />
      <div aria-hidden className="flex items-center justify-between gap-4">
        <span className="flex flex-col gap-2">
          <Placeholder className="h-10 w-40" />
          <Placeholder className="h-5 w-24" />
        </span>
        <Placeholder className="h-12 w-40" />
      </div>
      <Placeholder className="mt-10 h-7 w-56" />
      <ul aria-hidden className={cn(card, "mt-4 divide-y divide-stone-200")}>
        {[0, 1, 2].map((row) => (
          <li key={row} className="flex items-center gap-4 px-5 py-5">
            <Placeholder className="size-10 shrink-0 rounded-full" />
            <span className="flex flex-1 flex-col gap-2.5">
              <Placeholder className="h-6 w-40" />
              <Placeholder className="h-5 w-2/3" />
              <Placeholder className="h-4 w-1/2" />
            </span>
            <Placeholder className="h-12 w-28 rounded-full" />
          </li>
        ))}
      </ul>
    </div>
  );
}
