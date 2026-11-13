import { FollowListPage } from "../follow-list";

export const metadata = { title: "Following · Porchcard" };

export default async function FollowingPage({ params }: { params: Promise<{ id: string }> }) {
  return <FollowListPage id={(await params).id} which="following" />;
}
