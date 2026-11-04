import { describe, expect, it } from "vitest";
import { resample } from "./peaks";

describe("resample", () => {
  it("keeps the loudest sample in each bucket", () => {
    expect(resample([0.1, 0.9, 0.2, 0.3], 2)).toEqual([0.9, 0.3]);
  });

  it("stretches short input and handles empty input", () => {
    expect(resample([0.5], 3)).toEqual([0.5, 0.5, 0.5]);
    expect(resample([], 2)).toEqual([0, 0]);
  });
});
