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
  "XResolution",
  "YResolution",
  "ResolutionUnit",
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

await writeJson(outputPath("exiftool.json"), {
  generatedBy: "ExifTool",
  fields,
  references,
});

console.log(
  `ExifTool reference generated for ${Object.keys(references).length} samples.`,
);
