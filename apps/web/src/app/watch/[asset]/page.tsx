import { Player } from "@/components/player";
export default async function Page({
  params,
}: {
  params: Promise<{ asset: string }>;
}) {
  const { asset } = await params;
  return <Player asset={asset} />;
}
