import { redirect } from "next/navigation";
import { requireAgent } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ProfileForm } from "./form";

export default async function ProfilePage() {
  const agent = await requireAgent();
  // Once they have a name, these are among their other profile settings.
  // (This page is where a new agent is sent first, to add their name.)
  if (agent.full_name) redirect("/people/me/edit#details");
  // How clients reach them, and the phone they signed up with as a suggestion.
  const [contact] = await sql<{ phone: string; contact_phone: string; contact_email: string; mls_agent_id: string }[]>`
    select phone, contact_phone, contact_email, mls_agent_id from accounts where id = ${agent.id}`;
  return (
    <>
      <h1 className="font-display text-3xl">Your details</h1>
      <p className="mt-1 text-stone-700">What clients see on your links.</p>
      {/* A new agent is sent here from Clients and Send homes until they have a name. */}
      <p className="mt-2 font-medium text-ink">Add your name to start.</p>
      <ProfileForm
        fullName={agent.full_name}
        brokerage={agent.brokerage}
        brandColor={agent.brand_color}
        photo={agent.photo_data_url}
        contactPhone={contact?.contact_phone ?? ""}
        contactEmail={contact?.contact_email ?? ""}
        suggestedPhone={contact?.phone ?? ""}
        mlsAgentId={contact?.mls_agent_id ?? ""}
      />
    </>
  );
}
