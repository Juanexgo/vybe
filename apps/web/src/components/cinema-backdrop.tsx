export function CinemaBackdrop() {
  const films = [
    "sintel",
    "spring",
    "tears-of-steel",
    "cosmos-laundromat",
    "elephants-dream",
    "big-buck-bunny",
  ];
  return (
    <div className="cinema-backdrop" aria-hidden="true">
      <div className="poster-wall">
        {[...films, ...films].map((film, i) => (
          <div key={i} style={{ backgroundImage: `url(/art/${film}.svg)` }} />
        ))}
      </div>
      <div className="cinema-shade" />
    </div>
  );
}
