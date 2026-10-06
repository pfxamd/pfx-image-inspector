import { exifrAdapter } from "./exifr/exifr-adapter.js";
import { AdapterRegistry } from "./registry.js";
import { webpAdapter } from "./webp/webp-adapter.js";

export const defaultAdapterRegistry = new AdapterRegistry([webpAdapter, exifrAdapter]);
