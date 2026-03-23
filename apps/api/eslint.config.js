import node from "@repo/config-eslint/node";
import boundaries from "@repo/config-eslint/boundaries";

/** @type {import("eslint").Linter.Config[]} */
export default [...node, ...boundaries];
