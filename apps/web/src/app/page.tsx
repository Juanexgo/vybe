import { CatalogView } from "@/components/catalog";
import { initialCatalog } from "@/lib/server";
export const dynamic = "force-dynamic";
export default async function Home() {
  return <CatalogView initial={await initialCatalog()} />;
}
