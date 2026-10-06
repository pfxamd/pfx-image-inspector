import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, "../..");
export const CORPUS_DIR = resolve(ROOT, "fixtures/reference/files");
export const OUTPUT_DIR = resolve(ROOT, "fixtures/reference/generated");
export const MANIFEST_PATH = resolve(ROOT, "fixtures/reference/corpus.json");

export async function readManifest() {
  return JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
}

export async function ensureDirectories() {
  await mkdir(CORPUS_DIR, { recursive: true });
  await mkdir(OUTPUT_DIR, { recursive: true });
}

export function gitBlobSha(bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`);
  return createHash("sha1").update(header).update(bytes).digest("hex");
}

export function samplePath(sample) {
  return resolve(CORPUS_DIR, sample.path);
}

export function outputPath(name) {
  return resolve(OUTPUT_DIR, name);
}

export async function writeJson(path, value) {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n");
}
