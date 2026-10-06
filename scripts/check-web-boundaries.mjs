import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const root = resolve("apps/web/src");
const allowedCoreImports = new Set([
  "contracts/inspection.ts",
  "workers/metadata.worker.ts",
]);

const sourceFiles = await collect(root);
const violations = [];

for (const absolute of sourceFiles) {
  const source = await readFile(absolute, "utf8");
  const path = relative(root, absolute).replaceAll("\\", "/");

  if (source.includes("@pfx/metadata-core") && !allowedCoreImports.has(path)) {
    violations.push(
      `${path}: direct metadata-core import is not allowed in the web UI layer`,
    );
  }

  if (
    /\binspectImage\s*\(/.test(source) &&
    path !== "workers/metadata.worker.ts"
  ) {
    violations.push(
      `${path}: inspectImage() may only execute inside the metadata worker`,
    );
  }
}

if (violations.length > 0) {
  console.error("Web architecture boundary check failed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log(
    `Web architecture boundaries OK (${sourceFiles.length} source files checked).`,
  );
}

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collect(path)));
      continue;
    }

    if (entry.isFile() && [".ts", ".tsx"].includes(extname(entry.name))) {
      files.push(path);
    }
  }

  return files;
}
