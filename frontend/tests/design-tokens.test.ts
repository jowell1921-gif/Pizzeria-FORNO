import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");

function token(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match?.[1]) throw new Error(`Token --${name} not found`);
  return match[1];
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light! + 0.05) / (dark! + 0.05);
}

describe("brand palette", () => {
  it("keeps the official brand colors", () => {
    expect(token("tomato").toLowerCase()).toBe("#d94a32");
    expect(token("charcoal").toLowerCase()).toBe("#171717");
    expect(token("cream").toLowerCase()).toBe("#f5e6c8");
    expect(token("gold").toLowerCase()).toBe("#d6a84b");
  });

  // [foreground, background, minimum ratio]: 4.5 for normal text (WCAG 2.2 AA), 3 for large text and UI.
  const pairs: Array<[string, string, number]> = [
    ["white", "tomato-strong", 4.5],
    ["tomato-strong", "white", 4.5],
    ["tomato-deep", "cream", 4.5],
    ["tomato-deep", "cream-soft", 4.5],
    ["charcoal", "white", 4.5],
    ["charcoal", "cream", 4.5],
    ["cream", "charcoal", 4.5],
    ["white", "charcoal", 4.5],
    ["gold", "charcoal", 4.5],
    ["charcoal", "gold", 4.5],
    ["ink-muted", "white", 4.5],
    ["ink-muted", "cream", 4.5],
    ["ink-muted", "cream-soft", 4.5],
    ["tomato", "charcoal", 3],
  ];

  it.each(pairs)("%s on %s reaches %s:1", (foreground, background, minimum) => {
    expect(contrast(token(foreground), token(background))).toBeGreaterThanOrEqual(minimum);
  });
});
