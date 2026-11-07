import { Home, Map as MapIcon, MapPinOff } from "lucide-react";
import Link from "next/link";
import { FullScreenOnly } from "@/components/header-gate";
import { RouteState, routeAction } from "@/components/route-state";
import { SiteHeader } from "@/components/site-header";

export const metadata = { title: "Page not found · BuyBox Social" };

// Any address that isn't a page here, and anything that's gone (someone who
// isn't here): back home, or to the map to look around. (Where the feed
// would have drawn the header, this page brings it.)
export default function NotFound() {
  return (
    <>
      <FullScreenOnly>
        <SiteHeader />
      </FullScreenOnly>
      <RouteState
        icon={MapPinOff}
        title="We couldn't find that page"
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
        The link may be out of date, or the page may have moved.
      </RouteState>
    </>
  );
}
