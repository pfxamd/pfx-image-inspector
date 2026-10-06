import { readFile, writeFile } from "node:fs/promises";
import {
  ensureDirectories,
  gitBlobSha,
  readManifest,
  samplePath,
} from "./lib.mjs";

const manifest = await readManifest();
await ensureDirectories();

let downloaded = 0;
let reused = 0;

for (const sample of manifest.samples) {
  const source = manifest.sources?.[sample.source];
  if (!source) {
    throw new Error(`Unknown corpus source "${sample.source}" for ${sample.id}.`);
  }

  const path = samplePath(sample);
  let existing = null;

  try {
    existing = await readFile(path);
  } catch {}

  if (
    existing !== null &&
    existing.length === sample.size &&
    gitBlobSha(existing) === sample.gitBlobSha
  ) {
    reused += 1;
    continue;
  }

  const url =
    `https://raw.githubusercontent.com/${source.repository}/` +
    `${source.commit}/${sample.sourcePath}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${sample.id}: HTTP ${response.status} ${response.statusText}`,
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());

  if (bytes.length !== sample.size) {
    throw new Error(
      `${sample.id} size mismatch: expected ${sample.size}, received ${bytes.length}`,
    );
  }

  const sha = gitBlobSha(bytes);
  if (sha !== sample.gitBlobSha) {
    throw new Error(
      `${sample.id} Git blob SHA mismatch: expected ${sample.gitBlobSha}, received ${sha}`,
    );
  }

  await writeFile(path, bytes);
  downloaded += 1;
}

console.log(
  `Reference corpus ready: ${manifest.samples.length} samples (${downloaded} downloaded, ${reused} reused).`,
);
