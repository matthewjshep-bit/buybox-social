import { ArrowLeft, BookOpen, Building2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EditAbout } from "@/app/people/[id]/about";
import { PhotoControls, Toast } from "@/app/people/[id]/client";
import { Avatar } from "@/components/ui";
import { ApiCard } from "./api-card";
import { BannerPicker } from "./banner-picker";
import { LinkPrivacy } from "./link-privacy";
import { NameForm } from "./name-form";
import { LayoutPicker } from "@/app/dashboard/listings/look";
import { ProfileForm } from "@/app/dashboard/profile/form";
import { listApiKeys } from "@/lib/api/keys";
import { listWebhooks } from "@/lib/api/webhooks";
import { getCurrentUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { cn } from "@/lib/format";
import { getListingsLook } from "@/lib/own-listings";
import { getProfilePerson } from "@/lib/profile";
import { ensureAccountVisitor } from "@/lib/public";
import { backLink, button, card, fieldLabel, pageColumn, pageTitle } from "@/lib/ui";
import { isProKind, listingWords } from "@/lib/kinds";
import { KindPicker } from "./kind-picker";
import { PlaceForm } from "./place-form";
import { knownPlaces } from "@/lib/known-places";

export const metadata = { title: "Edit profile · Porchcard" };

// Your profile's settings, away from the page itself: your photo, your name
// (a buyer's; an agent's is among their details: name, company, how clients
// reach them, MLS ID, colour), the band across the top (a scene, nothing, or
// your own image), a few words about yourself, (an agent) your links, and
// (an agent) the keys and webhooks that connect their own tools.
// Only ever your own. Every card saves itself and stays on the page: the
// photo, banner and layout as they're picked, the rest by a button that says
// what it saves, then "Saved". "Your profile" at the top is the way back.
export default async function EditProfilePage() {
  const account = await getCurrentUser();
  if (!account?.role) redirect(`/login?next=${encodeURIComponent("/people/me/edit")}`);
  const me = await ensureAccountVisitor(account);
  const person = await getProfilePerson(me.id);
  if (!person) redirect("/people/me");
  const back = `/people/${person.id}`;
  // An agent's own details: how clients reach them, their MLS ID, and the
  // phone they signed up with as a suggestion.
  const [details] =
    account.role === "agent"
      ? await sql<{ phone: string; contact_phone: string; contact_email: string; mls_agent_id: string }[]>`
          select phone, contact_phone, contact_email, mls_agent_id from accounts where id = ${account.id}`
      : [];
  const name = person.name.trim() || account.full_name.trim() || account.email;
  // How an agent's listings are laid out on their profile.
  const look = account.role === "agent" ? await getListingsLook(account.id) : null;
  // An agent's API keys and webhooks: only theirs, and never a key or a
  // secret itself (those are shown once, as they're made).
  const [apiKeys, webhooks] =
    account.role === "agent" ? await Promise.all([listApiKeys(account.id), listWebhooks(account.id)]) : [[], []];

  return (
    <main className={pageColumn()}>
      <Link href={back} className={backLink}>
        <ArrowLeft aria-hidden size={18} /> Your profile
      </Link>
      <h1 className={cn(pageTitle, "mt-2")}>Edit profile</h1>

      <section aria-labelledby="photo-title" className={cn(card, "mt-6 p-5")}>
        <h2 id="photo-title" className="text-lg font-semibold">
          Photo
        </h2>
        <div className="mt-3 flex items-center gap-4">
          <Avatar name={name} tone={person.isAgent ? "agent" : "person"} photo={person.photo} size={18} />
          <div className="-mt-3">
            <PhotoControls hasPhoto={Boolean(person.photo)} />
          </div>
        </div>
      </section>

      {/* An agent's own details, as their clients see them on links and
          their profile: who they are, how to reach them, their MLS ID (which
          listings are theirs) and their colour. */}
      {details && (
        <section id="details" aria-labelledby="details-title" className={cn(card, "mt-4 scroll-mt-4 p-5")}>
          <h2 id="details-title" className="mb-4 text-lg font-semibold">
            Your details
          </h2>
          {/* What they are: the chip beside their name, and an investor's "Deals". */}
          <p className={cn(fieldLabel, "mb-2")}>You are</p>
          <div className="mb-5">
            <KindPicker kind={isProKind(account.kind) ? account.kind : "agent"} />
          </div>
          <ProfileForm
            embedded
            fullName={account.full_name}
            brokerage={account.brokerage}
            brandColor={account.brand_color}
            photo={account.photo_data_url}
            contactPhone={details.contact_phone}
            contactEmail={details.contact_email}
            suggestedPhone={details.phone}
            mlsAgentId={details.mls_agent_id}
          />
        </section>
      )}

      {/* A buyer's name, as they gave it when they signed up: theirs to
          correct. Everyone else only ever sees the first of it. */}
      {!details && (
        <section aria-labelledby="name-title" className={cn(card, "mt-4 p-5")}>
          <h2 id="name-title" className="mb-4 text-lg font-semibold">
            Your name
          </h2>
          <NameForm name={account.full_name.trim()} />
        </section>
      )}

      {/* Where they are: by their name on their profile, and what their feed leans toward. */}
      <section id="location" aria-labelledby="location-title" className={cn(card, "mt-4 scroll-mt-4 p-5")}>
        <h2 id="location-title" className="mb-1 text-lg font-semibold">
          Location
        </h2>
        <p className="mb-4 text-body text-muted">It&apos;s on your profile, and your feed shows you homes near it.</p>
        <PlaceForm place={person.place} places={await knownPlaces()} />
      </section>

      <section aria-labelledby="banner-title" className={cn(card, "mt-4 p-5")}>
        <h2 id="banner-title" className="text-lg font-semibold">
          Banner
        </h2>
        <BannerPicker
          seed={person.id}
          brand={person.brandColor}
          choice={person.banner}
          frame={person.bannerFrame}
          agent={person.isAgent}
        />
      </section>

      {/* An agent's listings on their profile: one featured, two or three across, or a list. */}
      {look && (
        <section id="layout" aria-labelledby="layout-title" className={cn(card, "mt-4 scroll-mt-4 p-5")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="layout-title" className="text-lg font-semibold">
              {listingWords(account.kind).Many}
            </h2>
            {/* Adding one, changing one: their own page for it. */}
            <Link href="/dashboard/listings" className={button({ kind: "secondary" })}>
              <Building2 aria-hidden size={16} /> Manage {listingWords(account.kind).many}
            </Link>
          </div>
          <p className="mt-3 text-body font-semibold">Layout on your profile</p>
          <div className="mt-2">
            <LayoutPicker layout={look.layout} />
          </div>
        </section>
      )}

      <section aria-labelledby="about-title" className={cn(card, "mt-4 p-5")}>
        <h2 id="about-title" className="text-lg font-semibold">
          {person.isAgent ? "About and links" : "About you"}
        </h2>
        {/* (That it's public is said under the box: "Shows on your profile.") */}
        <div className="mt-3">
          <EditAbout bio={person.bio} links={person.links} agent={person.isAgent} done={back} stay />
        </div>
      </section>
      {/* What others see of what they do on homes they're sent. */}
      <section aria-labelledby="privacy-title" className={cn(card, "mt-4 p-5")}>
        <h2 id="privacy-title" className="text-lg font-semibold">
          Privacy
        </h2>
        <LinkPrivacy shown={!person.hideLinks} />
      </section>

      {/* An agent's own tools (a CRM, Zapier, Make) working as them: a key
          for each, and webhooks to tell them when a client does something. */}
      {details && (
        <section id="api" aria-labelledby="api-title" className={cn(card, "mt-4 scroll-mt-4 p-5")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="api-title" className="text-lg font-semibold">
              Connect your tools
            </h2>
            <Link href="/developers" className={button({ kind: "secondary" })}>
              <BookOpen aria-hidden size={16} /> How it works
            </Link>
          </div>
          <p className="mt-1 text-body text-muted">Let your CRM, Zapier or Make send homes and add listings as you.</p>
          <ApiCard keys={apiKeys} webhooks={webhooks} />
        </section>
      )}
      <Toast />
    </main>
  );
}
