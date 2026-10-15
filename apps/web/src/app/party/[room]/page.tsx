import { PartyRoom } from "@/components/parties";
export default async function Page({
  params,
}: {
  params: Promise<{ room: string }>;
}) {
  const { room } = await params;
  return <PartyRoom room={room} />;
}
