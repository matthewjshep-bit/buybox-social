import { connection } from "next/server";
import { CommentList } from "@/components/admin-comments";
import { hrefWith, PageTitle, pageParam, Pager, SearchBox } from "@/components/admin-ui";
import { listComments } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth";

export const metadata = { title: "Comments · Admin" };

type Props = { searchParams: Promise<{ q?: string; page?: string }> };

export default async function AdminComments({ searchParams }: Props) {
  await connection();
  await requireAdmin();
  const params = await searchParams;
  const q = params.q?.trim() || undefined;
  const page = pageParam(params.page);
  const { rows, total } = await listComments({ q, page });

  return (
    <>
      <PageTitle title="Comments">
        Everything said in public on the site, newest first. Private chats between buyers and their agents aren&apos;t
        shown.
      </PageTitle>
      <SearchBox q={q} placeholder="Search comments, names or addresses" keep={{}} />
      <div className="mt-4 rounded-2xl bg-white px-4 ring-1 ring-stone-200 sm:px-5">
        <CommentList comments={rows} />
      </div>
      <Pager page={page} total={total} href={(p) => hrefWith("/admin/comments", { q, page: p })} />
    </>
  );
}
