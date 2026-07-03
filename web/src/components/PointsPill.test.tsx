import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PointsPill, { toneFor } from "./PointsPill.js";

describe("toneFor (chip colour by points)", () => {
  it("is green for a perfect game (5+)", () => {
    expect(toneFor(5).fg).toBe("#6bbf86");
    expect(toneFor(7).fg).toBe("#6bbf86");
  });
  it("is yellow for a partial score (1-4)", () => {
    expect(toneFor(1).fg).toBe("#e3c558");
    expect(toneFor(4).fg).toBe("#e3c558");
  });
  it("is red for a miss (0)", () => {
    expect(toneFor(0).fg).toBe("#e08a84");
  });
});

describe("<PointsPill>", () => {
  it("pluralises: 1pt vs 3pts", () => {
    const { rerender } = render(<PointsPill points={1} />);
    expect(screen.getByText("1pt")).toBeInTheDocument();
    rerender(<PointsPill points={3} />);
    expect(screen.getByText("3pts")).toBeInTheDocument();
  });

  it("compact mode shows the bare number", () => {
    render(<PointsPill points={5} compact />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });
});
