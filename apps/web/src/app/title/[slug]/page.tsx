import { TitleDetail } from "@/components/title-detail";
export default async function TitlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <TitleDetail slug={slug} />;
}
