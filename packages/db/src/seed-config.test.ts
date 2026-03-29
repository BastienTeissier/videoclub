import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadSeedConfig } from "./seed-config.js";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";

// Direct schema tests use inline parsing via loadSeedConfig's underlying schema
// We re-import the module to access the schema indirectly through loadSeedConfig

describe("seed config schema", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "seed-config-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true });
  });

  function writeConfig(data: unknown): string {
    const path = join(tempDir, "seed.config.json");
    writeFileSync(path, JSON.stringify(data));
    return path;
  }

  it("validates valid config with all source types", () => {
    const path = writeConfig({
      sources: [
        { type: "popular", pages: 10 },
        { type: "top_rated", pages: 5 },
        { type: "trending", timeWindow: "week", pages: 3 },
        { type: "now_playing", pages: 2 },
        { type: "upcoming", pages: 2 },
      ],
    });

    const config = loadSeedConfig(path);
    expect(config.sources).toHaveLength(5);
  });

  it("rejects invalid source type", () => {
    const path = writeConfig({
      sources: [{ type: "foobar", pages: 1 }],
    });

    expect(() => loadSeedConfig(path)).toThrow();
  });

  it("rejects negative pages", () => {
    const path = writeConfig({
      sources: [{ type: "popular", pages: -1 }],
    });

    expect(() => loadSeedConfig(path)).toThrow();
  });

  it("rejects zero pages", () => {
    const path = writeConfig({
      sources: [{ type: "popular", pages: 0 }],
    });

    expect(() => loadSeedConfig(path)).toThrow();
  });

  it("defaults timeWindow to 'week' for trending", () => {
    const path = writeConfig({
      sources: [{ type: "trending", pages: 1 }],
    });

    const config = loadSeedConfig(path);
    const trending = config.sources[0]!;
    expect(trending.type).toBe("trending");
    if (trending.type === "trending") {
      expect(trending.timeWindow).toBe("week");
    }
  });

  it("rejects empty sources array", () => {
    const path = writeConfig({ sources: [] });

    expect(() => loadSeedConfig(path)).toThrow();
  });

  it("loadSeedConfig throws on missing file", () => {
    expect(() => loadSeedConfig("/nonexistent/path/config.json")).toThrow(
      /not found/
    );
  });

  it("loadSeedConfig throws on invalid JSON", () => {
    const path = join(tempDir, "bad.json");
    writeFileSync(path, "{broken");

    expect(() => loadSeedConfig(path)).toThrow(/not valid JSON/);
  });
});
