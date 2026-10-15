import type { Catalog } from "./api";
export async function initialCatalog(): Promise<Catalog | undefined> {
  try {
    const res = await fetch(
      `${process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8080"}/api/catalog`,
      { cache: "no-store", signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) {
      console.error("Catalog API responded", res.status);
      return undefined;
    }
    return (await res.json()) as Catalog;
  } catch (error) {
    console.error(
      "Catalog API unavailable",
      error instanceof Error ? error.message : "Unknown connection error",
    );
    return undefined;
  }
}
