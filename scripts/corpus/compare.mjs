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
  ["FileType", (result) => result.file.format],
  ["MIMEType", (result) => result.file.mime],
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
const totals = createTotals();
const formats = new Map();

for (const sample of manifest.samples) {
  const ref = reference.references[sample.id];
  const formatTotals = getFormatTotals(sample.format);

  try {
    const bytes = await readFile(samplePath(sample));
    const result = await inspectImage(
      new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    );

    if (sample.robustnessOnly) {
      totals.robustnessSamples += 1;
      totals.robustnessCompleted += 1;
      formatTotals.robustnessSamples += 1;
      formatTotals.robustnessCompleted += 1;

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
    totals.samples += 1;
    formatTotals.samples += 1;

    for (const [name, getter] of mappings) {
      const expected = expectedField(name, ref?.fields ?? {});
      const actual = getter(result);
      const expectedPresent = hasValue(expected);
      const actualPresent = hasValue(actual);

      if (expectedPresent) {
        totals.expectedFields += 1;
        formatTotals.expectedFields += 1;
      }

      if (expectedPresent && actualPresent) {
        totals.recoveredFields += 1;
        formatTotals.recoveredFields += 1;
      }

      let status = "not-applicable";

      if (expectedPresent && !actualPresent) {
        status = "missing";
      } else if (expectedPresent && actualPresent) {
        totals.comparableFields += 1;
        formatTotals.comparableFields += 1;

        status = equivalent(name, expected, actual) ? "match" : "mismatch";

        if (status === "match") {
          totals.matchingFields += 1;
          formatTotals.matchingFields += 1;
        }
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
    if (sample.robustnessOnly) {
      totals.robustnessSamples += 1;
      totals.robustnessControlledErrors += 1;
      formatTotals.robustnessSamples += 1;
      formatTotals.robustnessControlledErrors += 1;

      samples.push({
        id: sample.id,
        format: sample.format,
        robustnessOnly: true,
        inspection: "controlled_error",
        error: error instanceof Error ? error.name : "UnknownError",
      });
      continue;
    }

    totals.inspectionFailures += 1;
    formatTotals.inspectionFailures += 1;

    samples.push({
      id: sample.id,
      format: sample.format,
      robustnessOnly: false,
      inspection: "failed",
      error: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

const summary = finishTotals({
  ...totals,
  corpusSamples: manifest.samples.length,
});

const byFormat = Object.fromEntries(
  [...formats.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([format, value]) => [format, finishTotals(value)]),
);

const report = { summary, byFormat, samples };
await writeJson(outputPath("comparison.json"), report);
await writeFile(outputPath("comparison.md"), renderMarkdown(report));

console.log(JSON.stringify({ summary, byFormat }, null, 2));

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
          format: sample.format,
          missing,
          mismatch,
        },
        null,
        2,
      ),
    );
  }
}

if (summary.inspectionFailures > 0) process.exitCode = 1;

function createTotals() {
  return {
    samples: 0,
    inspectionFailures: 0,
    expectedFields: 0,
    recoveredFields: 0,
    comparableFields: 0,
    matchingFields: 0,
    robustnessSamples: 0,
    robustnessCompleted: 0,
    robustnessControlledErrors: 0,
  };
}

function getFormatTotals(format) {
  let current = formats.get(format);
  if (!current) {
    current = createTotals();
    formats.set(format, current);
  }
  return current;
}

function finishTotals(value) {
  return {
    ...value,
    completeness:
      value.expectedFields === 0
        ? 1
        : round(value.recoveredFields / value.expectedFields),
    agreement:
      value.comparableFields === 0
        ? 1
        : round(value.matchingFields / value.comparableFields),
  };
}

function expectedField(name, fields) {
  return fields[name];
}

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

  if (name === "FileType") {
    return normalizeFileType(expected) === normalizeFileType(actual);
  }

  if (name === "MIMEType") {
    return String(expected).trim().toLowerCase() ===
      String(actual).trim().toLowerCase();
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

function normalizeFileType(value) {
  const text = String(value).trim().toLowerCase();
  if (text === "jpg") return "jpeg";
  if (text === "tif") return "tiff";
  if (text === "heif") return "heic";
  return text;
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
    /^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?/.exec(raw);

  if (match) {
    const seconds = match[6] ?? "00";
    return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${seconds}`;
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
    `- Corpus samples: ${report.summary.corpusSamples}`,
    `- Comparable samples: ${report.summary.samples}`,
    `- Robustness samples: ${report.summary.robustnessSamples}`,
    `- Inspection failures: ${report.summary.inspectionFailures}`,
    `- Completeness: ${percent(report.summary.completeness)} (${report.summary.recoveredFields}/${report.summary.expectedFields})`,
    `- Agreement: ${percent(report.summary.agreement)} (${report.summary.matchingFields}/${report.summary.comparableFields})`,
    "",
    "## By format",
    "",
    "| Format | Samples | Completeness | Agreement | Failures | Robustness |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
  ];

  for (const [format, stats] of Object.entries(report.byFormat)) {
    lines.push(
      `| ${format} | ${stats.samples} | ${percent(stats.completeness)} | ${percent(stats.agreement)} | ${stats.inspectionFailures} | ${stats.robustnessSamples} |`,
    );
  }

  lines.push(
    "",
    "## Samples",
    "",
    "| Sample | Format | Result | Match | Missing | Mismatch |",
    "| --- | --- | --- | ---: | ---: | ---: |",
  );

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
