import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  ensureDirectories,
  outputPath,
  readManifest,
  samplePath,
  writeJson,
} from "./lib.mjs";

const execFileAsync = promisify(execFile);
const manifest = await readManifest();
await ensureDirectories();

const fields = [
  "FileType",
  "MIMEType",
  "ImageWidth",
  "ImageHeight",
  "Orientation",
  "Make",
  "Model",
  "LensModel",
  "ISO",
  "FNumber",
  "FocalLength",
  "ExposureTime",
  "GPSLatitude",
  "GPSLongitude",
  "GPSAltitude",

  "ColorSpace",
  "ProfileDescription",
  "ExifVersion",
  "Software",
  "DateTimeOriginal",
  "CreateDate",
  "ModifyDate"
];

const references = {};

for (const sample of manifest.samples) {
  const args = [
    "-json",
    "-n",
    ...fields.map((field) => `-${field}`),
    samplePath(sample),
  ];

  try {
    const { stdout, stderr } = await execFileAsync("exiftool", args, {
      maxBuffer: 8 * 1024 * 1024,
    });
    const [record = {}] = JSON.parse(stdout);
    delete record.SourceFile;

    const exifResolution = await readResolution(
      samplePath(sample),
      "EXIF",
      3,
    );
    const jfifResolution = await readResolution(
      samplePath(sample),
      "JFIF",
      2,
    );
    const resolution =
      exifResolution.x !== null || exifResolution.y !== null
        ? exifResolution
        : jfifResolution;

    if (resolution.x !== null) record.XResolution = resolution.x;
    if (resolution.y !== null) record.YResolution = resolution.y;

    references[sample.id] = {
      status: "ok",
      fields: record,
      warnings: stderr.trim() ? [stderr.trim()] : [],
    };
  } catch (error) {
    references[sample.id] = {
      status: "failed",
      fields: {},
      warnings: [
        error instanceof Error ? error.message : "ExifTool execution failed",
      ],
    };
  }
}

async function readResolution(path, group, centimeterUnit) {
  const args = [
    "-json",
    "-n",
    `-${group}:XResolution`,
    `-${group}:YResolution`,
    `-${group}:ResolutionUnit`,
    path,
  ];

  try {
    const { stdout } = await execFileAsync("exiftool", args, {
      maxBuffer: 1024 * 1024,
    });
    const [record = {}] = JSON.parse(stdout);

    let x =
      typeof record.XResolution === "number" ? record.XResolution : null;
    let y =
      typeof record.YResolution === "number" ? record.YResolution : null;
    const unit = record.ResolutionUnit;

    if (unit === centimeterUnit) {
      if (x !== null) x *= 2.54;
      if (y !== null) y *= 2.54;
    }

    return { x, y };
  } catch {
    return { x: null, y: null };
  }
}

await writeJson(outputPath("exiftool.json"), {
  generatedBy: "ExifTool",
  fields,
  references,
});

console.log(
  `ExifTool reference generated for ${Object.keys(references).length} samples.`,
);
