import { requireAgent } from "@/lib/auth";
import { ProfileForm } from "./form";

export default async function ProfilePage() {
  const agent = await requireAgent();
  return (
    <>
      <h1 className="font-display text-3xl">Your brand</h1>
      <p className="mt-1 text-stone-700">This is what clients see when they open your links.</p>
      <ProfileForm
        fullName={agent.full_name}
        brokerage={agent.brokerage}
        brandColor={agent.brand_color}
        photo={agent.photo_data_url}
      />
    </>
  );
}
