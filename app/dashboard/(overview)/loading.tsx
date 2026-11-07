import { Loading, Placeholder } from "@/components/route-state";

// While the list of links is read, under the tabs (which stay): the shape of
// the heading, what's new and the first few links. Only this page: a client's
// page, or one that isn't theirs, settles first, so a 404 is still a 404.
export default function DashboardLoading() {
  return (
    <div aria-busy>
      <Loading what="your dashboard" />
      <div aria-hidden className="flex items-center justify-between gap-4">
        <Placeholder className="h-8 w-48" />
        <Placeholder className="h-11 w-32" />
      </div>
      <div aria-hidden className="mt-6 flex flex-col gap-4 rounded-2xl bg-white p-5 ring-1 ring-stone-200">
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
          <li key={row} className="flex flex-col gap-2.5 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
            <Placeholder className="h-5 w-40" />
            <Placeholder className="h-4 w-2/3" />
            <Placeholder className="h-3.5 w-1/2" />
          </li>
        ))}
      </ul>
    </div>
  );
}
