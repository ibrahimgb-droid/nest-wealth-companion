import { describe, expect, it } from "vitest";
import { isStaleChunkError } from "./stale-chunk-reload";

describe("isStaleChunkError", () => {
  it("matches Safari's module load failure", () => {
    expect(isStaleChunkError(new TypeError("Importing a module script failed."))).toBe(true);
  });
  it("matches Chrome's dynamic import failure", () => {
    expect(isStaleChunkError(new TypeError("Failed to fetch dynamically imported module: /x.js"))).toBe(true);
  });
  it("ignores ordinary app errors", () => {
    expect(isStaleChunkError(new Error("Cannot read properties of undefined"))).toBe(false);
  });
});
