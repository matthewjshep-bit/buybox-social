import { Loading, Placeholder } from "@/components/route-state";
import { cn } from "@/lib/format";
import { card } from "@/lib/ui";

// While the links are read, under the tabs (which stay): the shape of the
// heading and the first few links, each a photo, three lines and a button.
export default function LinksLoading() {
  return (
    <div aria-busy>
      <Loading what="your links" />
      <div aria-hidden className="flex items-center justify-between gap-4">
        <Placeholder className="h-10 w-28" />
        <Placeholder className="h-12 w-40" />
      </div>
      <ul aria-hidden className={cn(card, "mt-6 divide-y divide-stone-200")}>
        {[0, 1, 2].map((row) => (
          <li key={row} className="flex items-center gap-4 px-5 py-5">
            <Placeholder className="size-16 shrink-0 rounded-xl" />
            <span className="flex flex-1 flex-col gap-2.5">
              <Placeholder className="h-6 w-40" />
              <Placeholder className="h-5 w-2/3" />
              <Placeholder className="h-4 w-1/3" />
            </span>
            <Placeholder className="h-12 w-28 rounded-full" />
          </li>
        ))}
      </ul>
    </div>
  );
}
