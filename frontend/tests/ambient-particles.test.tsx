import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AmbientParticles } from "@/components/brand/ambient-particles";
import { FornoWatermark } from "@/components/brand/forno-watermark";

describe("AmbientParticles", () => {
  it("is purely decorative and hidden from assistive technology", () => {
    const { container } = render(<AmbientParticles />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("a, button, input")).toBeNull();
  });

  it("renders falling leaves and rising embers with their motion variables", () => {
    const { container } = render(<AmbientParticles />);
    const leaves = container.querySelectorAll<HTMLElement>(".ambient-leaf");
    const embers = container.querySelectorAll<HTMLElement>(".ambient-ember");

    expect(leaves.length).toBeGreaterThanOrEqual(8);
    expect(embers.length).toBeGreaterThanOrEqual(6);
    for (const leaf of leaves) {
      for (const name of ["--x", "--size", "--dur", "--delay", "--sway", "--spin", "--alpha"]) {
        expect(leaf.style.getPropertyValue(name), `${name} on a leaf`).not.toBe("");
      }
    }
    for (const ember of embers) {
      for (const name of ["--x", "--size", "--dur", "--delay", "--drift"]) {
        expect(ember.style.getPropertyValue(name), `${name} on an ember`).not.toBe("");
      }
    }
  });

  it("is deterministic so server and browser HTML match", () => {
    const first = render(<AmbientParticles />).container.innerHTML;
    const second = render(<AmbientParticles />).container.innerHTML;
    expect(first).toBe(second);
  });
});

describe("FornoWatermark", () => {
  it("renders the FORNEA letters as a decorative element", () => {
    const { container } = render(<FornoWatermark />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.firstElementChild).toHaveTextContent("FORNEA");
  });

  it("uses a stroke that contrasts with the background tone", () => {
    const dark = render(<FornoWatermark tone="dark" />).container.firstElementChild;
    const light = render(<FornoWatermark tone="light" />).container.firstElementChild;
    expect(dark?.className).toContain("245,230,200");
    expect(light?.className).toContain("23,23,23");
  });
});
