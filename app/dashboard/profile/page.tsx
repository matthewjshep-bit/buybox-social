import { redirect } from "next/navigation";
import { requireAgent } from "@/lib/auth";
import { pageTitle } from "@/lib/ui";
import { ProfileForm } from "./form";

// (The dashboard's own title is "Dashboard"; this page isn't it yet.)
export const metadata = { title: "Your details · Porchcard" };

// A new agent's first screen: who they are, and nothing else. A photo, a
// name, a company, a colour. How clients reach them and their MLS ID are
// among their profile settings (Edit profile), once they're in.
export default async function ProfilePage() {
  const agent = await requireAgent();
  // Once they have a name, these are among their other profile settings.
  // (This page is where a new agent is sent first, to add their name.)
  if (agent.full_name) redirect("/people/me/edit#details");
  return (
    <>
      <h1 className={pageTitle}>Your details</h1>
      {/* A new agent is sent here from the dashboard and Send homes until they have a name. */}
      <p className="mt-1 text-stone-700">Add your name to start.</p>
      <ProfileForm
        firstRun
        fullName={agent.full_name}
        brokerage={agent.brokerage}
        brandColor={agent.brand_color}
        photo={agent.photo_data_url}
        // (Not asked here, and nobody without a name has any yet.)
        contactPhone=""
        contactEmail=""
        suggestedPhone=""
        mlsAgentId=""
      />
    </>
  );
}
