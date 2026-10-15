import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty">
      <span className="eyebrow">404</span>
      <h1>This story took a different turn.</h1>
      <Link className="button primary" href="/">
        Back to discovery
      </Link>
    </div>
  );
}
