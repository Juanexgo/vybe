import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Welcome } from "@/components/welcome";
export const dynamic = "force-dynamic";
export default async function Home() {
  const jar = await cookies();
  const session = jar.get("VYBE_SESSION");
  let authenticated = false;
  if (session) {
    try {
      const response = await fetch(
        `${process.env.API_INTERNAL_URL || "http://localhost:8080"}/api/auth/me`,
        {
          headers: { Cookie: `${session.name}=${session.value}` },
          cache: "no-store",
          signal: AbortSignal.timeout(3000),
        },
      );
      authenticated = response.ok;
    } catch {
      /* The public welcome page remains available during API startup. */
    }
  }
  if (authenticated) redirect("/explore");
  return <Welcome />;
}
