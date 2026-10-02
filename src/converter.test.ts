import { describe, expect, it } from "vitest";
import { detectLayout } from "./layout";

describe("layout detection", () => {
  it("detects five-fold accordion manuals", () => {
    expect(detectLayout(2, 6081, 1792)).toBe("accordion-5");
    expect(detectLayout(2, 6013, 1769)).toBe("accordion-5");
  });

  it("detects six-fold accordion manuals", () => {
    expect(detectLayout(2, 7000, 2137)).toBe("accordion-6");
  });

  it("detects booklet spreads", () => {
    expect(detectLayout(8, 2865, 2022)).toBe("booklet");
  });

  it("requires review for unsupported geometry", () => {
    expect(detectLayout(1, 1000, 1000)).toBe("unknown");
  });
});
