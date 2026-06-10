import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  sourcemap: true,
  // better-sqlite3 is a native module; keep all deps external and install them
  // in the runtime image rather than bundling.
  skipNodeModulesBundle: true,
});
