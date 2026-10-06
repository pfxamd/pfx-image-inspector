import { exifrAdapter } from "./exifr/exifr-adapter.js";
import { AdapterRegistry } from "./registry.js";

export const defaultAdapterRegistry = new AdapterRegistry([exifrAdapter]);
