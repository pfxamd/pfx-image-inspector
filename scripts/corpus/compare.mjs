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

        if (
          process.env.CORPUS_DEBUG_VALUES === "1" &&
          (status === "missing" || status === "mismatch")
        ) {
          console.log(
            JSON.stringify({
              debugSample: sample.id,
              field: name,
              expected,
              actual,
            }),
          );
        }
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

for (const sample of samples) {
  if (sample.robustnessOnly || !Array.isArray(sample.fields)) continue;

  const missing = sample.fields
    .filter((field) => field.status === "missing")
    .map((field) => field.name);
  const mismatch = sample.fields
    .filter((field) => field.status === "mismatch")
    .map((field) => field.name);

  if (missing.length > 0 || mismatch.length > 0) {
    console.log(
      JSON.stringify(
        {
          sample: sample.id,
          missing,
          mismatch,
        },
        null,
        2,
      ),
    );
  }
}

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

  if (name === "ColorSpace") {
    return normalizeColorSpace(expected) === normalizeColorSpace(actual);
  }

  if (name.endsWith("Date") || name.includes("Time")) {
    return normalizeDate(expected) === normalizeDate(actual);
  }

  return String(expected).trim().toLowerCase() ===
    String(actual).trim().toLowerCase();
}

function normalizeVersion(value) {
  const text = String(value).trim();
  const dotted = /^(\d+)\.(\d+)$/.exec(text);
  if (dotted) return formatVersion(dotted[1], dotted[2]);

  const raw = text.replace(/[^0-9]/g, "");
  if (raw.length === 4) return formatVersion(raw.slice(0, 2), raw.slice(2));
  if (raw.length === 3) return formatVersion(raw.slice(0, 1), raw.slice(1));
  return text;
}

function formatVersion(majorRaw, minorRaw) {
  const major = Number.parseInt(majorRaw, 10);
  const minor = minorRaw.replace(/0+$/, "") || "0";
  return `${Number.isFinite(major) ? major : majorRaw}.${minor}`;
}

function normalizeColorSpace(value) {
  const text = String(value).trim().toLowerCase();
  if (text === "1" || text === "srgb") return "srgb";
  if (text === "65535" || text === "uncalibrated") return "uncalibrated";
  return text.replace(/\s+/g, " ");
}

function normalizeDate(value) {
  const raw = String(value).trim();
  const match =
    /^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw);

  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`;
  }

  return raw.replace(/\s+/g, " ");
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
