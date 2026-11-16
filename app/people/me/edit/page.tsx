import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EditAbout } from "@/app/people/[id]/about";
import { PhotoControls, Toast } from "@/app/people/[id]/client";
import { Avatar } from "@/components/ui";
import { BannerPicker } from "./banner-picker";
import { getCurrentUser } from "@/lib/auth";
import { cn } from "@/lib/format";
import { getProfilePerson } from "@/lib/profile";
import { ensureAccountVisitor } from "@/lib/public";
import { card } from "@/lib/ui";

export const metadata = { title: "Edit profile · Porchcard" };

// Your profile's settings, away from the page itself: your photo, the band
// across the top (a scene, nothing, or your own image), a few words
// about yourself, and (an agent) your links. Only ever your own.
export default async function EditProfilePage() {
  const account = await getCurrentUser();
  if (!account?.role) redirect(`/login?next=${encodeURIComponent("/people/me/edit")}`);
  const me = await ensureAccountVisitor(account);
  const person = await getProfilePerson(me.id);
  if (!person) redirect("/people/me");
  const back = `/people/${person.id}`;
  const name = person.name.trim() || account.full_name.trim() || account.email;

  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-4 lg:pt-8">
      <Link href={back} className="-ml-2 inline-flex min-h-11 items-center gap-2 rounded-full px-2 font-medium hover:bg-black/5">
        <ArrowLeft aria-hidden size={18} /> Your profile
      </Link>
      <h1 className="mt-2 font-display text-4xl">Edit profile</h1>

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

      <section aria-labelledby="about-title" className={cn(card, "mt-4 p-5")}>
        <h2 id="about-title" className="text-lg font-semibold">
          {person.isAgent ? "About and links" : "About you"}
        </h2>
        <p className="mt-1 text-body text-muted">Public.</p>
        <div className="mt-4">
          <EditAbout bio={person.bio} links={person.links} agent={person.isAgent} done={back} />
        </div>
      </section>
      <Toast />
    </main>
  );
}
