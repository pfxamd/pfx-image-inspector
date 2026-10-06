import { readFile, writeFile } from "node:fs/promises";
import { inspectImage } from "../../packages/metadata-core/dist/index.js";
import {
  ensureDirectories,
  outputPath,
  readManifest,
  samplePath,
  writeJson,
} from "./lib.mjs";

const manifest = await readManifest();
await ensureDirectories();

const reference = JSON.parse(
  await readFile(outputPath("exiftool.json"), "utf8"),
);

const mappings = [
  ["ImageWidth", (result) => result.image.width],
  ["ImageHeight", (result) => result.image.height],
  ["Orientation", (result) => result.image.orientation],
  ["Make", (result) => result.camera?.make ?? null],
  ["Model", (result) => result.camera?.model ?? null],
  ["LensModel", (result) => result.camera?.lens ?? null],
  ["ISO", (result) => result.camera?.iso ?? null],
  ["FNumber", (result) => result.camera?.aperture ?? null],
  ["FocalLength", (result) => result.camera?.focalLength ?? null],
  ["ExposureTime", (result) => result.camera?.exposureTime ?? null],
  ["GPSLatitude", (result) => result.location?.latitude ?? null],
  ["GPSLongitude", (result) => result.location?.longitude ?? null],
  ["GPSAltitude", (result) => result.location?.altitude ?? null],
  ["XResolution", (result) => result.image.dpi?.x ?? null],
  ["YResolution", (result) => result.image.dpi?.y ?? null],
  ["ColorSpace", (result) => result.color?.colorSpace ?? null],
  ["ProfileDescription", (result) => result.color?.profileName ?? null],
  ["ExifVersion", (result) => result.standards.exif.version],
  ["Software", (result) => result.software?.name ?? null],
  ["DateTimeOriginal", (result) => result.timestamps.takenAt],
  ["CreateDate", (result) => result.timestamps.digitizedAt],
  ["ModifyDate", (result) => result.timestamps.modifiedAt],
];

const samples = [];
let totalExpected = 0;
let totalRecovered = 0;
let totalComparable = 0;
let totalMatches = 0;
let inspectionFailures = 0;

for (const sample of manifest.samples) {
  const ref = reference.references[sample.id];

  try {
    const bytes = await readFile(samplePath(sample));
    const result = await inspectImage(
      new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    );

    if (sample.robustnessOnly) {
      samples.push({
        id: sample.id,
        format: sample.format,
        robustnessOnly: true,
        inspection: "completed",
        warnings: result.warnings.map((warning) => warning.code),
      });
      continue;
    }

    const fields = [];

    for (const [name, getter] of mappings) {
      const expected = ref?.fields?.[name];
      const actual = getter(result);
      const expectedPresent = hasValue(expected);
      const actualPresent = hasValue(actual);

      if (expectedPresent) totalExpected += 1;
      if (expectedPresent && actualPresent) totalRecovered += 1;

      let status = "not-applicable";
      if (expectedPresent && !actualPresent) {
        status = "missing";
      } else if (expectedPresent && actualPresent) {
        totalComparable += 1;
        status = equivalent(name, expected, actual) ? "match" : "mismatch";
        if (status === "match") totalMatches += 1;
      }

      if (expectedPresent || actualPresent) {
        fields.push({ name, status });
      }
    }

    samples.push({
      id: sample.id,
      format: sample.format,
      robustnessOnly: false,
      inspection: "completed",
      fields,
      warnings: result.warnings.map((warning) => warning.code),
    });
  } catch (error) {
    inspectionFailures += 1;
    samples.push({
      id: sample.id,
      format: sample.format,
      robustnessOnly: Boolean(sample.robustnessOnly),
      inspection: "failed",
      error: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

const summary = {
  samples: manifest.samples.length,
  inspectionFailures,
  expectedFields: totalExpected,
  recoveredFields: totalRecovered,
  completeness:
    totalExpected === 0 ? 1 : round(totalRecovered / totalExpected),
  comparableFields: totalComparable,
  matchingFields: totalMatches,
  agreement:
    totalComparable === 0 ? 1 : round(totalMatches / totalComparable),
};

const report = { summary, samples };
await writeJson(outputPath("comparison.json"), report);
await writeFile(outputPath("comparison.md"), renderMarkdown(report));

console.log(JSON.stringify(summary, null, 2));

if (inspectionFailures > 0) process.exitCode = 1;

function hasValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function equivalent(name, expected, actual) {
  if (typeof expected === "number" && typeof actual === "number") {
    const tolerance =
      name.startsWith("GPS") ? 1e-5 :
      name === "ExposureTime" ? 1e-7 :
      1e-6;
    return Math.abs(expected - actual) <= tolerance;
  }

  if (name === "ExifVersion") {
    return normalizeVersion(expected) === normalizeVersion(actual);
  }

  if (name.endsWith("Date") || name.includes("Time")) {
    return normalizeDate(expected) === normalizeDate(actual);
  }

  return String(expected).trim().toLowerCase() ===
    String(actual).trim().toLowerCase();
}

function normalizeVersion(value) {
  const raw = String(value).replace(/[^0-9]/g, "");
  if (raw.length === 4) {
    const major = Number.parseInt(raw.slice(0, 2), 10);
    const minor = raw.slice(2).replace(/0+$/, "") || "0";
    return `${major}.${minor}`;
  }
  return String(value).trim();
}

function normalizeDate(value) {
  if (value instanceof Date) return value.toISOString();
  const raw = String(value).trim();
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  return raw.replace(/:/g, "-").replace(/\s+/g, " ");
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}

function renderMarkdown(report) {
  const percent = (value) => `${(value * 100).toFixed(2)}%`;
  const lines = [
    "# PFx Reference Corpus Report",
    "",
    `- Samples: ${report.summary.samples}`,
    `- Inspection failures: ${report.summary.inspectionFailures}`,
    `- Completeness: ${percent(report.summary.completeness)} (${report.summary.recoveredFields}/${report.summary.expectedFields})`,
    `- Agreement: ${percent(report.summary.agreement)} (${report.summary.matchingFields}/${report.summary.comparableFields})`,
    "",
    "| Sample | Format | Result | Match | Missing | Mismatch |",
    "| --- | --- | --- | ---: | ---: | ---: |",
  ];

  for (const sample of report.samples) {
    if (sample.robustnessOnly) {
      lines.push(
        `| ${sample.id} | ${sample.format} | ${sample.inspection} | — | — | — |`,
      );
      continue;
    }

    const counts = { match: 0, missing: 0, mismatch: 0 };
    for (const field of sample.fields ?? []) {
      if (field.status in counts) counts[field.status] += 1;
    }

    lines.push(
      `| ${sample.id} | ${sample.format} | ${sample.inspection} | ${counts.match} | ${counts.missing} | ${counts.mismatch} |`,
    );
  }

  lines.push("");
  lines.push(
    "The report intentionally omits metadata values. It records only comparison status and aggregate measurements.",
  );
  lines.push("");

  return lines.join("\n");
}
