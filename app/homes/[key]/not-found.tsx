import { Home, Map as MapIcon, MapPinOff } from "lucide-react";
import Link from "next/link";
import { RouteState, routeAction } from "@/components/route-state";
import { SiteHeader } from "@/components/site-header";

// A link to a home that's gone, most often one that sold: the site's header
// (there's no feed here to draw it), what happened, and where to look next.
export default function HomeNotFound() {
  return (
    <>
      <SiteHeader />
      <RouteState
        icon={MapPinOff}
        title="We couldn't find that home"
        actions={
          <>
            <Link href="/" className={routeAction.primary}>
              <Home aria-hidden size={18} />
              Go home
            </Link>
            <Link href="/search" className={routeAction.secondary}>
              <MapIcon aria-hidden size={18} />
              Open the map
            </Link>
          </>
        }
      >
        It may have sold or been taken off the market.
      </RouteState>
    </>
  );
}
