import Link from "next/link";
export default function Help() {
  return (
    <div className="member-page help-page">
      <span className="eyebrow">MAKE YOURSELF AT HOME</span>
      <h1>A little help. More movie night.</h1>
      <p className="muted">Your guide to the VYBE experience.</p>
      <div className="help-grid">
        {[
          [
            "How do profiles work?",
            "Open your avatar next to search to switch profiles. Each profile has its own library, preferences, and viewing history. Profiles share one account; they are not separate password-protected accounts.",
            "/profiles",
            "Manage profiles",
          ],
          [
            "Where did I leave off?",
            "The home page shows unfinished stories for your active profile. Open Continue watching to resume, or History to review and clear your saved progress.",
            "/continue",
            "Continue watching",
          ],
          [
            "Can I watch with someone?",
            "Create a screening room, choose playable media, and share the invitation link. Guests sign in to join. The host controls playback and everyone can chat.",
            "/parties",
            "Start a movie night",
          ],
          [
            "How do shared lists work?",
            "Create a watchlist and invite collaborators. Members can help choose the next story; the owner manages access.",
            "/lists",
            "Open shared lists",
          ],
          [
            "How do I find something different?",
            "Use the search icon for titles, or mood search for themes, language, and duration. For you includes recommendation preferences and explanations.",
            "/discover",
            "Find a story",
          ],
          [
            "How do I manage my account?",
            "Open Account & security to see your email and access password reset. Google sign-in appears only after the service is configured. For this testing environment, verification emails are captured in the private test inbox.",
            "/account",
            "Account & security",
          ],
          [
            "Why do some titles have no play button?",
            "Catalog entries can exist before their media has been uploaded and processed. VYBE only offers playback when a playable asset is available.",
            "/explore",
            "Browse the catalog",
          ],
          [
            "Why can the testing site be unavailable?",
            "This preview runs in a Codespace that can stop when idle. The owner must restart it and keep the web port public. If GitHub shows a development-site notice, continue only if you trust this VYBE link.",
            "/about",
            "About this project",
          ],
        ].map(([title, body, href, label]) => (
          <details key={title}>
            <summary>{title}</summary>
            <p>{body}</p>
            <Link className="text-link" href={href}>
              {label} →
            </Link>
          </details>
        ))}
      </div>
    </div>
  );
}
