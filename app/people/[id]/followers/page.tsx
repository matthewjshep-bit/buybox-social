import { FollowListPage } from "../follow-list";

export const metadata = { title: "Followers · Porchcard" };

export default async function FollowersPage({ params }: { params: Promise<{ id: string }> }) {
  return <FollowListPage id={(await params).id} which="followers" />;
}
