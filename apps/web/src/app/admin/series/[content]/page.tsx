import { EpisodeEditor } from "@/components/episode-editor";
export default async function Page({
  params,
}: {
  params: Promise<{ content: string }>;
}) {
  const { content } = await params;
  return <EpisodeEditor content={content} />;
}
