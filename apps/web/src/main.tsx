/**
 * ┌──────────────────────────────────────────────┐
 * │                                              │
 * │  PFxamd                                      │
 * │  Ahmed                                       │
 * │                                              │
 * └──────────────────────────────────────────────┘
 *
 * @project     PFx Image Inspector
 * @author      Ahmed
 * @brand       PFxamd
 * @website     https://www.pfxamd.com
 * @repository  https://github.com/pfxamd/pfx-image-inspector
 * @license     Apache-2.0
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("PFx Image Inspector root element is missing.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
