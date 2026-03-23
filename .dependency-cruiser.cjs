/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "web-must-not-import-db",
      severity: "error",
      comment: "Frontend must never import the database package",
      from: { path: "^apps/web" },
      to: { path: "^packages/db" },
    },
    {
      name: "web-must-not-import-api",
      severity: "error",
      comment: "Frontend must not import backend code directly",
      from: { path: "^apps/web" },
      to: { path: "^apps/api" },
    },
    {
      name: "api-must-not-import-ui",
      severity: "error",
      comment: "Backend must never import the UI package",
      from: { path: "^apps/api" },
      to: { path: "^packages/ui" },
    },
    {
      name: "ui-must-not-import-db",
      severity: "error",
      comment: "UI package must never import the database package",
      from: { path: "^packages/ui" },
      to: { path: "^packages/db" },
    },
    {
      name: "contracts-must-not-import-framework",
      severity: "error",
      comment: "Contracts must not import framework-specific code",
      from: { path: "^packages/contracts" },
      to: {
        path: "^(packages/db|packages/ui|apps/)",
      },
    },
    {
      name: "no-circular",
      severity: "error",
      comment: "No circular dependencies allowed",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
    reporterOptions: {
      text: {
        highlightFocused: true,
      },
    },
  },
};
