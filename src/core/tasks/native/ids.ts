/*
 * Hash-based task ids (e.g. bt-a3f) and hierarchical child ids (bt-a3f.1).
 *
 * Adapted from Beads (https://github.com/gastownhall/beads):
 * internal/idgen/hash.go (GenerateHashID, EncodeBase36) and
 * internal/storage/issueops/helpers.go (ComputeAdaptiveLength).
 * MIT License, Copyright (c) 2025 Beads Contributors. See THIRD_PARTY_NOTICES.md.
 */
import { createHash } from "node:crypto";
import { MAX_CHILD_DEPTH, TaskError } from "./model.js";

const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Big-endian bytes -> base36, left-padded with "0", keeping the last `length` chars. */
export function encodeBase36(data: Uint8Array, length: number): string {
  let num = 0n;
  for (const byte of data) num = (num << 8n) | BigInt(byte);
  let out = "";
  while (num > 0n) {
    out = BASE36[Number(num % 36n)] + out;
    num /= 36n;
  }
  out = out.padStart(length, "0");
  return out.length > length ? out.slice(out.length - length) : out;
}

/** Bytes of the SHA-256 digest used per output length (Beads' table). */
function bytesForLength(length: number): number {
  switch (length) {
    case 3:
      return 2;
    case 4:
      return 3;
    case 5:
    case 6:
      return 4;
    case 7:
    case 8:
      return 5;
    default:
      return 3;
  }
}

export interface HashIdInput {
  prefix: string;
  title: string;
  description: string;
  creator: string;
  /** Nanoseconds since the epoch. */
  timestampNs: bigint;
  length: number;
  nonce: number;
}

export function generateHashId(i: HashIdInput): string {
  const content = `${i.title}|${i.description}|${i.creator}|${i.timestampNs}|${i.nonce}`;
  const digest = createHash("sha256").update(content).digest();
  return `${i.prefix}-${encodeBase36(digest.subarray(0, bytesForLength(i.length)), i.length)}`;
}

export interface AdaptiveIdConfig {
  maxCollisionProbability: number;
  minLength: number;
  maxLength: number;
}

export const DEFAULT_ADAPTIVE_ID: AdaptiveIdConfig = {
  maxCollisionProbability: 0.25,
  minLength: 3,
  maxLength: 8,
};

/** Smallest length whose birthday-bound collision probability stays under the threshold. */
export function computeAdaptiveLength(
  numIssues: number,
  cfg: AdaptiveIdConfig = DEFAULT_ADAPTIVE_ID,
): number {
  for (let length = cfg.minLength; length <= cfg.maxLength; length++) {
    const total = 36 ** length;
    const prob = 1 - Math.exp(-(numIssues * numIssues) / (2 * total));
    if (prob <= cfg.maxCollisionProbability) return length;
  }
  return cfg.maxLength;
}

/**
 * Generate an id not in `exists`, trying nonces 0-9 at each length from the
 * adaptive base length up to 8 (Beads' GenerateIssueIDInTable).
 */
export function generateUniqueId(
  input: Omit<HashIdInput, "length" | "nonce">,
  topLevelCount: number,
  exists: (id: string) => boolean,
): string {
  const base = computeAdaptiveLength(topLevelCount);
  for (let length = base; length <= DEFAULT_ADAPTIVE_ID.maxLength; length++) {
    for (let nonce = 0; nonce < 10; nonce++) {
      const id = generateHashId({ ...input, length, nonce });
      if (!exists(id)) return id;
    }
  }
  throw new TaskError("could not generate a unique id; try again", "conflict");
}

/** Child id `<parent>.<n>`; depth is capped at MAX_CHILD_DEPTH dots. */
export function childId(parentId: string, n: number): string {
  const depth = (parentId.match(/\./g) ?? []).length;
  if (depth >= MAX_CHILD_DEPTH) {
    throw new TaskError(
      `cannot nest deeper than ${MAX_CHILD_DEPTH} levels under ${parentId}`,
      "invalid",
    );
  }
  return `${parentId}.${n}`;
}

/** Next child number given existing ids (max existing <parent>.N + 1). */
export function nextChildNumber(parentId: string, existingIds: Iterable<string>): number {
  const prefix = `${parentId}.`;
  let max = 0;
  for (const id of existingIds) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length).split(".")[0]);
    if (Number.isInteger(n) && n > max) max = n;
  }
  return max + 1;
}

/** Default id prefix from a project folder name: lowercase alphanumerics, max 10 chars. */
export function defaultPrefix(folderName: string): string {
  const p = folderName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 10);
  return p || "task";
}

export function nowNs(): bigint {
  return BigInt(Date.now()) * 1_000_000n + (process.hrtime.bigint() % 1_000_000n);
}
