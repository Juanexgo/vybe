import { Watchlists } from "@/components/watchlists";
export default async function Page({
  params,
}: {
  params: Promise<{ list: string }>;
}) {
  const { list } = await params;
  return <Watchlists key={list} list={list} />;
}
