/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular dependencies make the CLI hard to reason about.",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-unresolved",
      severity: "error",
      comment: "Every import must resolve.",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "no-dev-deps-in-src",
      severity: "error",
      comment: "Runtime code must not import devDependencies.",
      from: { path: "^src" },
      to: { dependencyTypes: ["npm-dev"] },
    },
    {
      name: "no-orphans",
      severity: "warn",
      comment: "Reachable from the CLI entry point.",
      from: {
        orphan: true,
        pathNot: ["^src/cli\\.mjs$"],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)(node_modules|docs|skills|reports)/" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
  },
}
