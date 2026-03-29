import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const simpleSourceSchema = z.object({
  type: z.enum(["popular", "top_rated", "now_playing", "upcoming"]),
  pages: z.number().int().positive(),
});

const trendingSourceSchema = z.object({
  type: z.literal("trending"),
  timeWindow: z.enum(["day", "week"]).default("week"),
  pages: z.number().int().positive(),
});

const seedSourceSchema = z.discriminatedUnion("type", [
  simpleSourceSchema,
  trendingSourceSchema,
]);

const seedConfigSchema = z.object({
  sources: z.array(seedSourceSchema).min(1),
});

export type SeedSource = z.infer<typeof seedSourceSchema>;
export type SeedConfig = z.infer<typeof seedConfigSchema>;

export function loadSeedConfig(path?: string): SeedConfig {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const configPath = path ?? resolve(__dirname, "..", "seed.config.json");

  let raw: string;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch {
    throw new Error(`Seed config not found at ${configPath}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("Seed config is not valid JSON");
  }

  return seedConfigSchema.parse(json);
}
