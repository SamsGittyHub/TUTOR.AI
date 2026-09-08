/**
 * Compiles the pure modules to ESM, then runs the node test files against them.
 *
 * There's no test framework here on purpose: the parts worth testing (the
 * streaming JSON parser, action repair, the expression evaluator, retrieval,
 * and each provider's wire decoding) are plain functions, and a runner that
 * takes four seconds gets run.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, ".test-build");

const TARGETS = [
  {
    dir: "core",
    files: [
      "src/lib/actions.ts",
      "src/lib/stream-json.ts",
      "src/lib/expr.ts",
      "src/lib/materials/chunk.ts",
      "src/lib/materials/retrieve.ts",
    ],
  },
  { dir: "providers", files: ["src/lib/providers/index.ts"] },
];

rmSync(out, { recursive: true, force: true });

for (const target of TARGETS) {
  execFileSync(
    "npx",
    [
      "tsc",
      ...target.files,
      "--outDir", join(out, target.dir),
      "--module", "esnext",
      "--target", "es2022",
      "--moduleResolution", "bundler",
      "--lib", "es2022,dom",
      "--skipLibCheck",
      "--strict",
    ],
    { cwd: root, stdio: "inherit" },
  );
}

// Mark the emitted tree as ESM so node doesn't try CommonJS first.
writeFileSync(join(out, "package.json"), JSON.stringify({ type: "module" }));

// tsc emits extensionless relative imports; node's ESM loader wants the .js.
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (path.endsWith(".js")) {
      writeFileSync(
        path,
        readFileSync(path, "utf8").replace(/(from\s+"\.[^"]*?)(?<!\.js)"/g, '$1.js"'),
      );
    }
  }
};
walk(out);

for (const file of ["tests/core.test.mjs", "tests/providers.test.mjs"]) {
  execFileSync("node", [file], { cwd: root, stdio: "inherit" });
}
