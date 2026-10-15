import { PartyLobby } from "@/components/parties";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string }>;
}) {
  const { asset } = await searchParams;
  return <PartyLobby asset={asset} />;
}
