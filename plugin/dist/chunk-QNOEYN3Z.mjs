#!/usr/bin/env node
import { createRequire as __batonCreateRequire } from "node:module";
const require = __batonCreateRequire(import.meta.url);
import {
  require_dist
} from "./chunk-HAV7IRWM.mjs";
import {
  ContextPaths,
  contextPath
} from "./chunk-HVIRJWHJ.mjs";
import {
  __toESM
} from "./chunk-UC4Y6CAD.mjs";

// src/core/guards-config.ts
var import_yaml = __toESM(require_dist(), 1);
import { readFile } from "fs/promises";
var PREFLIGHT_DEFAULTS = [
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "requirements.txt",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "**/migrations/**"
];
var isRecord = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
async function loadGuardsConfig(root) {
  let raw;
  try {
    raw = await readFile(contextPath(root, ContextPaths.config), "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return guardsFrom({});
    throw err;
  }
  const doc = (0, import_yaml.parse)(raw) ?? {};
  if (!isRecord(doc)) throw new Error("config.yaml: expected a mapping");
  return guardsFrom(doc);
}
function guardsFrom(doc) {
  const guards = doc.guards === void 0 ? {} : doc.guards;
  if (!isRecord(guards)) throw new Error("config.yaml: guards must be a mapping");
  const { protectState = true, preflightPaths = [...PREFLIGHT_DEFAULTS] } = guards;
  if (typeof protectState !== "boolean") {
    throw new Error("config.yaml: guards.protectState must be a boolean");
  }
  if (!Array.isArray(preflightPaths) || !preflightPaths.every((p) => typeof p === "string")) {
    throw new Error("config.yaml: guards.preflightPaths must be a list of strings");
  }
  return { protectState, preflightPaths };
}

export {
  PREFLIGHT_DEFAULTS,
  loadGuardsConfig
};
//# sourceMappingURL=chunk-QNOEYN3Z.mjs.map