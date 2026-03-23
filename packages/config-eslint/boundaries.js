import boundaries from "eslint-plugin-boundaries";

const elements = [
  { type: "web", pattern: "apps/web/*" },
  { type: "api", pattern: "apps/api/*" },
  { type: "ui", pattern: "packages/ui/*" },
  { type: "contracts", pattern: "packages/contracts/*" },
  { type: "db", pattern: "packages/db/*" },
  { type: "tmdb-client", pattern: "packages/tmdb-client/*" },
];

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    plugins: { boundaries },
    settings: {
      "boundaries/elements": elements,
      "boundaries/ignore": ["**/*.test.*", "**/*.spec.*"],
    },
    rules: {
      "boundaries/element-types": [
        "error",
        {
          default: "allow",
          rules: [
            {
              from: "web",
              disallow: ["db", "api", "tmdb-client"],
              message:
                "${file.type} must not import from ${dependency.type}",
            },
            {
              from: "api",
              disallow: ["ui", "web"],
              message:
                "${file.type} must not import from ${dependency.type}",
            },
            {
              from: "ui",
              disallow: ["db", "api", "web", "tmdb-client"],
              message:
                "${file.type} must not import from ${dependency.type}",
            },
            {
              from: "contracts",
              disallow: ["db", "api", "web", "ui", "tmdb-client"],
              message:
                "${file.type} must not import from ${dependency.type}",
            },
          ],
        },
      ],
    },
  },
];
