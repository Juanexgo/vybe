import { it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TitleCard, ErrorBox } from "./catalog";
it("renders a title as an accessible link to the real catalog detail", () => {
  render(
    <TitleCard
      title={{
        id: "1",
        slug: "spring",
        title: "Spring",
        kind: "MOVIE",
        synopsis: "A journey",
        releaseYear: 2019,
        durationMinutes: 8,
        language: "No dialogue",
        rating: "PG",
        artwork: "/art/spring.svg",
        accent: "#365643",
        genres: "Fantasy",
      }}
    />,
  );
  expect(screen.getByRole("link")).toHaveAttribute("href", "/title/spring");
  expect(screen.getByRole("heading", { name: "Spring" })).toBeVisible();
  expect(screen.getByRole("img")).toHaveAttribute(
    "alt",
    "Original illustrated artwork for Spring",
  );
});
it("exposes failures to assistive technology", () => {
  render(<ErrorBox error={new Error("Service unavailable")} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Service unavailable");
});
