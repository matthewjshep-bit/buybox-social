import { Home, Link2Off } from "lucide-react";
import Link from "next/link";
import { RouteState, routeAction } from "@/components/route-state";

// A link that was never sent, or has been taken back. Agents' links have no
// site header, so this one offers the way home itself.
export default function ShareNotFound() {
  return (
    <RouteState
      icon={Link2Off}
      title="This link isn't available"
      actions={
        <Link href="/" className={routeAction.primary}>
          <Home aria-hidden size={18} />
          Go to BuyBox Social
        </Link>
      }
    >
      Ask whoever sent it to share a new one.
    </RouteState>
  );
}
