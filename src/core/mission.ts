import { basename } from "node:path";
import { fitToBudget, PACKET_HEADER, type PacketBlock } from "./budget.js";
import type { Config } from "./config.js";
import { evaluateFreshness, type SectionFreshness } from "./drift.js";
import { BatonError } from "./errors.js";
import { isInjectable } from "./freshness.js";
import { contextPath } from "./paths.js";
import { type AdrInfo, type IndexProblem, loadSectionIndex } from "./sections.js";
import { writeFileAtomic } from "./tasks/native/jsonl.js";
import { getTask, readTaskSnapshot } from "./tasks/snapshot.js";
import type { FreshnessLevel, Task } from "./types.js";

/**
 * Mission packet assembly (ADR 0014). `stateHead`, `buildBlocks` and `assemblePacket` are
 * pure: text from already-gathered inputs, with no IO, no clock and no absolute
 * paths, so their output is deterministic. `buildMission` is the impure edge: it reads the
 * section index, the task snapshot and git history, and takes the clock as an
 * option. `writePacketCache` is the only function here that writes.
 */

/** Characters kept free for the "Left out for space" line. */
export const DROPPED_RESERVE = 100;

/** Lower numbers are kept first. */
export const PACKET_PRIORITY = {
  state: 0,
  tasks: 1,
  freshness: 2,
  spec: 3,
  decision: 4,
  memory: 5,
  pointers: 6,
} as const;

export interface PacketInputs {
  project: string;
  head: string | null;
  generatedAt: string;
  /** Index order. */
  sections: SectionFreshness[];
  problems: IndexProblem[];
  /** In-progress first, then ready. */
  tasks: Task[];
  memories: { key: string; value: string }[];
}

export interface PacketBlockInfo {
  key: string;
  priority: number;
  chars: number;
  kept: boolean;
}

export interface WithheldSection {
  id: string;
  level: "stale" | "unverified" | "superseded";
  reason: string;
}

export interface MissionResult {
  text: string;
  chars: number;
  maxChars: number;
  /** Every block, priority order (stable). */
  blocks: PacketBlockInfo[];
  /** Index order. */
  withheld: WithheldSection[];
  taskIds: string[];
}

/** STATE.md body after its `# ` title, up to (not including) the second `## ` heading. */
export function stateHead(body: string): string {
  const lines = body.split("\n");
  if (lines[0]?.startsWith("# ")) lines.shift();
  const kept: string[] = [];
  let h2 = 0;
  for (const line of lines) {
    if (line.startsWith("## ") && ++h2 === 2) break;
    kept.push(line);
  }
  return kept.join("\n").trim();
}

function header(inputs: PacketInputs): string {
  const head = inputs.head === null ? "none" : inputs.head.slice(0, 12);
  return `${PACKET_HEADER}\nProject ${inputs.project} at commit ${head}, generated ${inputs.generatedAt}. Facts below come from .context/, the task store and git.`;
}

function stateBlock(inputs: PacketInputs): PacketBlock | undefined {
  const sf = inputs.sections.find((s) => s.section.doc === "state");
  if (!sf || !isInjectable(sf.result.level)) return undefined;
  const head = stateHead(sf.section.body);
  if (head === "") return undefined;
  const n = sf.commitsOutsideContext;
  const first =
    n === null || n === 0
      ? "State (from .context/STATE.md):"
      : `State (from .context/STATE.md; ${n} commit(s) outside .context/ since it was generated):`;
  return { key: "state", priority: PACKET_PRIORITY.state, text: `${first}\n${head}` };
}

function firstLine(text: string): string | undefined {
  return text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l !== "");
}

function taskBlock(task: Task): PacketBlock {
  const meta = [
    ...(task.priority === undefined ? [] : [`P${task.priority}`]),
    task.status.replaceAll("_", " "),
    ...(task.assignee ? [`@${task.assignee}`] : []),
  ].join(", ");
  const lines = [`Task ${task.id} (${meta}): ${task.title}`];
  if (task.specSections.length > 0) lines.push(`  spec sections: ${task.specSections.join(", ")}`);
  if (task.checkCommand) lines.push(`  check: ${task.checkCommand}`);
  const desc = task.description === undefined ? undefined : firstLine(task.description);
  if (desc !== undefined) {
    lines.push(`  description: ${desc.length > 200 ? `${desc.slice(0, 200)}…` : desc}`);
  }
  return { key: `task:${task.id}`, priority: PACKET_PRIORITY.tasks, text: lines.join("\n") };
}

function taskBlocks(tasks: Task[]): PacketBlock[] {
  if (tasks.length === 0) {
    return [
      {
        key: "tasks",
        priority: PACKET_PRIORITY.tasks,
        text: "No tasks are in progress or ready in the task store.",
      },
    ];
  }
  return tasks.map(taskBlock);
}

function freshnessBlock(inputs: PacketInputs, unknownIds: string[]): PacketBlock | undefined {
  const at = (level: FreshnessLevel) => inputs.sections.filter((s) => s.result.level === level);
  const withReason = (list: SectionFreshness[]) =>
    list.map((s) => `${s.section.meta.id} (${s.result.reason})`).join("; ");
  const aging = at("aging");
  const stale = at("stale");
  const unverified = at("unverified");
  const superseded = at("superseded");
  if (
    aging.length + stale.length + unverified.length + superseded.length === 0 &&
    unknownIds.length === 0 &&
    inputs.problems.length === 0
  ) {
    return undefined;
  }
  const fresh = at("fresh");
  const lines = [
    `Freshness of .context/: ${fresh.length} fresh, ${aging.length} aging, ${stale.length} stale, ${unverified.length} unverified, ${superseded.length} superseded.`,
  ];
  if (aging.length > 0) lines.push(`Aging: ${withReason(aging)}.`);
  if (stale.length > 0) lines.push(`Withheld as stale: ${withReason(stale)}.`);
  if (unverified.length > 0) {
    lines.push(`Withheld as unverified: ${unverified.map((s) => s.section.meta.id).join(", ")}.`);
  }
  if (superseded.length > 0) {
    const items = superseded.map((s) =>
      s.section.meta.supersededBy === undefined
        ? s.section.meta.id
        : `${s.section.meta.id} (by ${s.section.meta.supersededBy})`,
    );
    lines.push(`Superseded: ${items.join(", ")}.`);
  }
  if (unknownIds.length > 0) {
    lines.push(`Task labels name unknown sections: ${unknownIds.join(", ")}.`);
  }
  if (inputs.problems.length > 0) {
    lines.push(
      `Problems in .context/ (affected sections skipped): ${inputs.problems.map((p) => p.message).join("; ")}.`,
    );
  }
  if (stale.length + unverified.length > 0) {
    lines.push("baton verify-doc <id> records a section as verified at HEAD after review.");
  }
  return { key: "freshness", priority: PACKET_PRIORITY.freshness, text: lines.join("\n") };
}

function specBlock(sf: SectionFreshness): PacketBlock {
  const { section, result } = sf;
  const label = section.doc === "spec" ? "Spec section" : "Section";
  const fresh = result.level === "aging" ? `aging: ${result.reason}` : "fresh";
  return {
    key: `spec:${section.meta.id}`,
    priority: PACKET_PRIORITY.spec,
    text: `${label} "${section.title}" (${section.meta.id}, ${section.file}:${section.line}, ${fresh}):\n${section.body}`,
  };
}

/** Every block, in priority order. */
export function buildBlocks(inputs: PacketInputs): PacketBlock[] {
  const blocks: PacketBlock[] = [];

  const state = stateBlock(inputs);
  if (state) blocks.push(state);

  blocks.push(...taskBlocks(inputs.tasks));

  const byId = new Map(inputs.sections.map((s) => [s.section.meta.id, s]));
  const specIds = [...new Set(inputs.tasks.flatMap((t) => t.specSections))];
  const unknownIds = specIds.filter((id) => {
    const sf = byId.get(id);
    return sf === undefined || sf.section.doc === "decision";
  });

  const freshness = freshnessBlock(inputs, unknownIds);
  if (freshness) blocks.push(freshness);

  for (const id of specIds) {
    const sf = byId.get(id);
    if (sf && sf.section.doc !== "decision" && isInjectable(sf.result.level)) {
      blocks.push(specBlock(sf));
    }
  }

  const specSet = new Set(specIds);
  const adrs: { sf: SectionFreshness; adr: AdrInfo }[] = [];
  for (const sf of inputs.sections) {
    const adr = sf.section.adr;
    if (sf.section.doc !== "decision" || !adr || !isInjectable(sf.result.level)) continue;
    if (!adr.status.toLowerCase().startsWith("accepted")) continue;
    if (adr.specSections.some((id) => specSet.has(id))) adrs.push({ sf, adr });
  }
  adrs.sort((a, b) => a.adr.number - b.adr.number);
  for (const { sf, adr } of adrs) {
    blocks.push({
      key: `adr:${sf.section.meta.id}`,
      priority: PACKET_PRIORITY.decision,
      text: `Decision ADR ${String(adr.number).padStart(4, "0")} (${adr.status}): ${sf.section.title} (${sf.section.file})`,
    });
  }

  for (const m of inputs.memories) {
    blocks.push({
      key: `memory:${m.key}`,
      priority: PACKET_PRIORITY.memory,
      text: `Memory ${m.key}: ${m.value}`,
    });
  }

  const topics = inputs.sections
    .filter((s) => s.section.doc === "knowledge")
    .map((s) => s.section.meta.id);
  blocks.push({
    key: "pointers",
    priority: PACKET_PRIORITY.pointers,
    text: `More context on demand: .context/spec.md, .context/decisions/, .context/knowledge/ (topics: ${topics.length > 0 ? topics.join(", ") : "none"}). baton mission --task <id> prints the brief for one task.`,
  });

  return blocks;
}

export function assemblePacket(inputs: PacketInputs, maxChars: number): MissionResult {
  const head = header(inputs);
  const min = head.length + 2 + DROPPED_RESERVE;
  if (maxChars < min) {
    throw new BatonError(`budget ${maxChars} is too small (minimum ${min})`);
  }
  const blocks = buildBlocks(inputs)
    .map((b, i) => ({ b, i }))
    .sort((x, y) => x.b.priority - y.b.priority || x.i - y.i)
    .map(({ b }) => b);
  const fit = fitToBudget(blocks, maxChars - head.length - 2 - DROPPED_RESERVE);

  const parts = [head, ...fit.kept.map((b) => b.text)];
  if (fit.dropped.length > 0) {
    parts.push(
      `Left out for space: ${fit.dropped.length} block(s); baton mission --format json lists them.`,
    );
  }
  const text = parts.join("\n\n");
  if (text.length > maxChars) throw new Error("packet over budget");

  const keptKeys = new Set(fit.kept.map((b) => b.key));
  const withheld: WithheldSection[] = [];
  for (const s of inputs.sections) {
    const level = s.result.level;
    if (level === "stale" || level === "unverified" || level === "superseded") {
      withheld.push({ id: s.section.meta.id, level, reason: s.result.reason });
    }
  }
  return {
    text,
    chars: text.length,
    maxChars,
    blocks: blocks.map((b) => ({
      key: b.key,
      priority: b.priority,
      chars: b.text.length,
      kept: keptKeys.has(b.key),
    })),
    withheld,
    taskIds: inputs.tasks.map((t) => t.id),
  };
}

export interface MissionOptions {
  maxChars?: number;
  taskId?: string;
  now?: Date;
}

/** Gather the inputs from .context/, the task store and git, then assemble. Writes nothing. */
export async function buildMission(
  root: string,
  config: Config,
  opts: MissionOptions = {},
): Promise<MissionResult> {
  const index = await loadSectionIndex(root, { lenient: true });
  const [report, snapshot] = await Promise.all([
    evaluateFreshness(index, config),
    readTaskSnapshot(root, config, { readyLimit: config.packet.maxTasks, closedLimit: 0 }),
  ]);

  let tasks: Task[];
  if (opts.taskId !== undefined) {
    const task = await getTask(root, config, opts.taskId);
    if (task === null) throw new BatonError(`no task ${opts.taskId}`);
    tasks = [task];
  } else {
    const seen = new Set<string>();
    tasks = [];
    for (const t of [...snapshot.inProgress, ...snapshot.ready]) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      tasks.push(t);
    }
    tasks = tasks.slice(0, config.packet.maxTasks);
  }

  return assemblePacket(
    {
      project: basename(root),
      head: report.head,
      generatedAt: (opts.now ?? new Date()).toISOString(),
      sections: report.sections,
      problems: index.problems,
      tasks,
      memories: snapshot.memories,
    },
    opts.maxChars ?? config.packet.maxChars,
  );
}

/** Keep the last packet for `stats` and debugging: text and the full result. */
export async function writePacketCache(root: string, result: MissionResult): Promise<void> {
  writeFileAtomic(contextPath(root, ".cache", "last-packet.txt"), result.text);
  writeFileAtomic(
    contextPath(root, ".cache", "last-packet.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
}

/** `--budget` value: an integer string from 1 to 10000, else the fallback when absent. */
export function parseBudget(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isInteger(n) || n < 1 || n > 10000) {
    throw new BatonError("budget must be an integer from 1 to 10000");
  }
  return n;
}
