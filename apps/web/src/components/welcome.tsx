import Link from "next/link";
import { ArrowRight, Sparkles, Users, Bookmark, Play } from "lucide-react";
import { CinemaBackdrop } from "./cinema-backdrop";
export function Welcome() {
  return (
    <div className="welcome">
      <section className="welcome-hero">
        <CinemaBackdrop />
        <div className="welcome-copy">
          <span className="cinema-kicker">
            <span /> YOUR NEXT GREAT STORY
          </span>
          <h1>
            Find your film.
            <br />
            Find your <em>vybe.</em>
          </h1>
          <p>
            Stories that stay with you. Discover something different, build your
            own collection, and make movie night a shared experience.
          </p>
          <div className="welcome-actions">
            <Link className="button primary" href="/register">
              Get started <ArrowRight size={20} />
            </Link>
            <Link className="button cinema-secondary" href="/explore">
              <Play size={17} /> Explore the catalog
            </Link>
          </div>
          <span className="welcome-note">
            One account. Your own profiles. A world to discover.
          </span>
        </div>
        <div className="hero-caption">
          <span>THE VYBE COLLECTION</span>
          <span>Animation · Imagination · Independent stories</span>
        </div>
      </section>
      <section className="welcome-features" aria-label="The VYBE experience">
        <div>
          <Sparkles />
          <span>01 / DISCOVER</span>
          <h2>
            Less scrolling.
            <br />
            More feeling.
          </h2>
          <p>
            Find stories by mood, genre, or a thought you can’t quite put into
            words.
          </p>
        </div>
        <div>
          <Bookmark />
          <span>02 / MAKE IT YOURS</span>
          <h2>
            Your taste.
            <br />
            Your little universe.
          </h2>
          <p>
            Keep a personal watchlist, choose your profile, and pick up where
            you left off.
          </p>
        </div>
        <div>
          <Users />
          <span>03 / WATCH TOGETHER</span>
          <h2>
            Different places.
            <br />
            Same movie night.
          </h2>
          <p>
            Start a watch party, bring your people, and share the moments as
            they happen.
          </p>
        </div>
      </section>
      <section className="welcome-bottom">
        <span className="cinema-kicker">GOOD STORIES DESERVE GOOD COMPANY</span>
        <h2>
          Your next movie night
          <br />
          starts here.
        </h2>
        <Link href="/register" className="button primary">
          Create your account <ArrowRight size={18} />
        </Link>
        <p>
          Already part of VYBE? <Link href="/login">Sign in</Link>
        </p>
      </section>
    </div>
  );
}
