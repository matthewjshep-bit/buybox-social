import { redirect } from "next/navigation";
import { getCurrentUser, sitePath } from "@/lib/auth";
import { sql } from "@/lib/db";
import { isKind } from "@/lib/kinds";
import { knownPlaces } from "@/lib/known-places";
import { placeLabel } from "@/lib/places";
import { Onboarding } from "./onboarding";

export const metadata = { title: "Welcome · Porchcard" };

// Getting started, once someone has signed up: what they are (an agent, an
// investor, a lender, or shopping for a home), then a question at a time
// about them, each on a screen of its own. Then on to where they were
// going (`next`), or Home.
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ next?: string; as?: string }> }) {
  const { next: asked, as } = await searchParams;
  const me = await getCurrentUser();
  if (!me) redirect(`/login?next=${encodeURIComponent("/welcome")}`);
  // (Never back here, or to signing in: that would only come round again.)
  const wanted = sitePath(asked);
  const next = wanted && !wanted.startsWith("/welcome") && !wanted.startsWith("/login") ? wanted : null;
  const [row] = await sql<
    {
      kind: string | null;
      full_name: string;
      brokerage: string;
      mls_agent_id: string;
      photo_data_url: string | null;
      brand_color: string;
      location_city: string;
      location_state: string;
    }[]
  >`
    select kind, full_name, brokerage, mls_agent_id, photo_data_url, brand_color, location_city, location_state
    from accounts where id = ${me.id}`;
  const kind = isKind(row?.kind) ? row.kind : null;
  // Nothing left to ask: on their way.
  if (kind && row.full_name.trim()) redirect(next ?? "/");
  return (
    // (Sized to what's on it: each step's button sits right under its box,
    // not at the foot of the window, nor under a phone's keyboard.)
    <main className="mx-auto max-w-md px-5 pb-10 pt-6 sm:pt-12">
      <Onboarding
        kind={kind}
        name={row.full_name}
        company={row.brokerage}
        mlsId={row.mls_agent_id}
        photo={row.photo_data_url}
        color={row.brand_color}
        place={placeLabel({ city: row.location_city, state: row.location_state })}
        places={await knownPlaces()}
        next={next}
        // From "For agents": the pros come first.
        pro={as === "agent"}
      />
    </main>
  );
}
