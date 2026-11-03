import { addPublicComment, joinPublic, setPublicReaction } from "@/app/homes/actions";
import { NameGate } from "@/components/listing-thread";
import { SearchView } from "@/components/search-view";
import { getCurrentUser } from "@/lib/auth";
import { readDevice } from "@/lib/engagement";
import { getPublicIdentity } from "@/lib/public";
import { searchHomes } from "@/lib/search";
import { parseFilters } from "@/lib/search-options";

export const metadata = { title: "Search homes · BuyBox Social" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseFilters(await searchParams);
  const [account, device] = await Promise.all([getCurrentUser(), readDevice()]);
  const { visitor, name } = await getPublicIdentity(account, device);
  const results = await searchHomes(filters, visitor?.id ?? null);
  return (
    <NameGate
      actions={{ join: joinPublic, react: setPublicReaction, comment: addPublicComment }}
      myName={name}
      prompt="Your first name shows next to what you post, and anyone visiting can see it. No account or password needed."
    >
      <SearchView filters={filters} results={results} />
    </NameGate>
  );
}
