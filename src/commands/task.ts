import type { Command } from "commander";
import { loadConfig } from "../core/config.js";
import { BatonError, ExitCode } from "../core/errors.js";
import {
  DEP_TYPES,
  type DepType,
  ISSUE_TYPES,
  type Issue,
  type IssueType,
  isDepType,
  isIssueType,
  isStatus,
  parsePriority,
  type Status,
  TaskError,
} from "../core/tasks/native/model.js";
import type { SortPolicy, TaskService, UpdateInput } from "../core/tasks/native/service.js";
import { openTaskService } from "../core/tasks/native/store.js";
import { checkCommands } from "../core/verify.js";
import { action, projectRoot } from "./_shared.js";

/** Exit codes for task errors: lookups fail with 1, refused state changes with 2. */
export function toBatonError(err: TaskError): BatonError {
  const blocked = [
    "already_claimed",
    "not_claimable",
    "has_open_children",
    "has_open_blockers",
    "cycle",
    "conflict",
  ];
  return new BatonError(
    err.message,
    blocked.includes(err.code) ? ExitCode.Blocked : ExitCode.Error,
  );
}

export async function withTasks<T>(
  globals: { actor?: string },
  fn: (s: TaskService) => T | Promise<T>,
): Promise<T> {
  const root = await projectRoot();
  const config = await loadConfig(root);
  const { service, db } = openTaskService(
    root,
    config,
    globals.actor ? { actor: globals.actor } : {},
  );
  try {
    return await fn(service);
  } catch (err) {
    if (err instanceof TaskError) throw toBatonError(err);
    throw err;
  } finally {
    db.close();
  }
}

const list = (v: string | undefined): string[] =>
  v
    ? v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

function parseType(v: string): IssueType {
  if (!isIssueType(v)) throw new BatonError(`type must be one of ${ISSUE_TYPES.join(", ")}`);
  return v;
}

function parseStatuses(v: string | undefined): Status[] | undefined {
  const items = list(v);
  for (const s of items) if (!isStatus(s)) throw new BatonError(`unknown status ${s}`);
  return items.length ? (items as Status[]) : undefined;
}

/** "blocks:bt-a3f,related:bt-b2c" or bare ids (blocks). */
function parseDeps(v: string | undefined): [DepType, string][] {
  return list(v).map((item) => {
    const [a, b] = item.includes(":") ? item.split(":", 2) : ["blocks", item];
    if (!isDepType(a) || !b)
      throw new BatonError(`bad dependency "${item}" (type:id, types: ${DEP_TYPES.join(", ")})`);
    return [a, b];
  });
}

export function formatIssueLine(i: Issue): string {
  const who = i.assignee ? `  @${i.assignee}` : "";
  const labels = i.labels.length ? `  [${i.labels.join(", ")}]` : "";
  return `${i.id.padEnd(12)} P${i.priority}  ${i.status.padEnd(11)} ${i.issueType.padEnd(8)} ${i.title}${who}${labels}`;
}

export function formatIssue(i: Issue): string {
  const lines = [
    `${i.id}: ${i.title}`,
    `  status ${i.status} · P${i.priority} · ${i.issueType}${i.assignee ? ` · @${i.assignee}` : ""}`,
    `  created ${i.createdAt}${i.createdBy ? ` by ${i.createdBy}` : ""} · updated ${i.updatedAt}`,
  ];
  if (i.closedAt) lines.push(`  closed ${i.closedAt}: ${i.closeReason ?? ""}`);
  if (i.deferUntil) lines.push(`  deferred until ${i.deferUntil}`);
  if (i.labels.length) lines.push(`  labels: ${i.labels.join(", ")}`);
  for (const d of i.dependencies) lines.push(`  ${d.type} -> ${d.dependsOnId}`);
  for (const [name, text] of [
    ["description", i.description],
    ["design", i.design],
    ["acceptance", i.acceptanceCriteria],
    ["notes", i.notes],
  ] as const) {
    if (text) lines.push("", `${name}:`, ...text.split("\n").map((l) => `  ${l}`));
  }
  if (i.comments.length) {
    lines.push("", "comments:");
    for (const c of i.comments)
      lines.push(`  #${c.id} ${c.author ?? ""} ${c.createdAt}`, `    ${c.text}`);
  }
  return lines.join("\n");
}

function out(json: boolean | undefined, data: unknown, text: () => string): void {
  process.stdout.write(json ? `${JSON.stringify(data, null, 2)}\n` : `${text()}\n`);
}

/**
 * `baton task ...`: the native task store (ADR 0009). Data lives in
 * .context/tasks.jsonl (committed); a SQLite cache in .context/.cache/ is
 * rebuilt from it automatically. Edit tasks only through these commands.
 */
export function registerTask(program: Command): void {
  const task = program
    .command("task")
    .description("structured task store (.context/tasks.jsonl): create, ready, claim, close …")
    .option("--actor <name>", "who is acting (default: BATON_ACTOR, git user.name, OS user)");
  const g = () => task.opts<{ actor?: string }>();

  task
    .command("create")
    .description("create a task")
    .argument("<title>", "task title")
    .option("-d, --description <text>", "description")
    .option("--acceptance <text>", "acceptance criteria")
    .option("--design <text>", "design notes")
    .option("--notes <text>", "notes")
    .option("-p, --priority <0-4>", "priority, 0 = most urgent", "2")
    .option("-t, --type <type>", `one of ${ISSUE_TYPES.join(", ")}`, "task")
    .option(
      "-l, --labels <list>",
      "comma-separated labels (spec:<id>, check:<cmd> are understood by baton)",
    )
    .option(
      "--check <command>",
      "command `baton verify` runs to accept the task (stored as label check:<command>)",
    )
    .option("--spec <ids>", "spec section ids this task implements (stored as labels spec:<id>)")
    .option("--parent <id>", "create as a child task (id becomes <parent>.N)")
    .option("--deps <list>", "dependencies, e.g. blocks:bt-a3f,related:bt-b2c")
    .option("--defer-until <iso>", "hide from ready until this time")
    .option("--json", "print JSON")
    .action(
      action(async (title: string, o: Record<string, string | boolean | undefined>) => {
        await withTasks(g(), (s) => {
          const input: Parameters<TaskService["create"]>[0] = {
            title,
            priority: parsePriority(String(o.priority)),
            issueType: parseType(String(o.type)),
            labels: [
              ...list(o.labels as string | undefined),
              ...list(o.spec as string | undefined).map((id) => `spec:${id}`),
              ...(o.check ? [`check:${String(o.check)}`] : []),
            ],
            deps: parseDeps(o.deps as string | undefined),
          };
          if (o.description) input.description = String(o.description);
          if (o.acceptance) input.acceptanceCriteria = String(o.acceptance);
          if (o.design) input.design = String(o.design);
          if (o.notes) input.notes = String(o.notes);
          if (o.parent) input.parent = String(o.parent);
          if (o.deferUntil) input.deferUntil = String(o.deferUntil);
          const issue = s.create(input);
          out(Boolean(o.json), issue, () => `created ${issue.id}: ${issue.title}`);
        });
      }),
    );

  task
    .command("list")
    .description("list tasks (open and in progress by default)")
    .option("-s, --status <list>", "comma-separated statuses")
    .option("-a, --all", "include closed tasks")
    .option("-l, --labels <list>", "require all of these labels")
    .option("--parent <id>", "only descendants of this task")
    .option("--assignee <name>", "only tasks assigned to this name")
    .option("-t, --type <type>", "only this type")
    .option("-n, --limit <n>", "max results")
    .option("--json", "print JSON")
    .action(
      action(async (o: Record<string, string | boolean | undefined>) => {
        await withTasks(g(), (s) => {
          const status =
            parseStatuses(o.status as string | undefined) ??
            (o.all ? undefined : (["open", "in_progress", "blocked", "deferred"] as Status[]));
          const f: Parameters<TaskService["list"]>[0] = {
            labels: list(o.labels as string | undefined),
          };
          if (status) f.status = status;
          if (o.parent) f.parent = String(o.parent);
          if (o.assignee) f.assignee = String(o.assignee);
          if (o.type) f.issueType = parseType(String(o.type));
          if (o.limit) f.limit = Number(o.limit);
          const issues = s.list(f);
          out(Boolean(o.json), issues, () => issues.map(formatIssueLine).join("\n") || "no tasks");
        });
      }),
    );

  task
    .command("show")
    .description("show one task in full")
    .argument("<id>")
    .option("--json", "print JSON")
    .action(
      action(async (id: string, o: { json?: boolean }) => {
        await withTasks(g(), (s) => {
          const issue = s.get(id);
          if (!issue) throw new BatonError(`no task ${id}`);
          out(o.json, issue, () => formatIssue(issue));
        });
      }),
    );

  task
    .command("ready")
    .description("unblocked open work, in priority order")
    .option("-n, --limit <n>", "max results", "10")
    .option("--sort <policy>", "priority | oldest | hybrid", "priority")
    .option("-l, --labels <list>", "require all of these labels")
    .option("--parent <id>", "only descendants of this task")
    .option("--unassigned", "only unassigned tasks")
    .option("--include-deferred", "include deferred tasks")
    .option("--claim", "claim the first ready task for the current actor")
    .option("--json", "print JSON")
    .action(
      action(async (o: Record<string, string | boolean | undefined>) => {
        await withTasks(g(), (s) => {
          const sort = String(o.sort) as SortPolicy;
          if (!["priority", "oldest", "hybrid"].includes(sort))
            throw new BatonError("sort must be priority, oldest or hybrid");
          const f: Parameters<TaskService["ready"]>[0] = {
            limit: Number(o.limit),
            sort,
            labels: list(o.labels as string | undefined),
            unassigned: Boolean(o.unassigned),
            includeDeferred: Boolean(o.includeDeferred),
          };
          if (o.parent) f.parent = String(o.parent);
          if (o.claim) {
            const claimed = s.claimNext(f);
            if (!claimed) throw new BatonError("nothing ready to claim", ExitCode.Blocked);
            out(Boolean(o.json), claimed, () => `claimed ${claimed.id}: ${claimed.title}`);
            return;
          }
          const issues = s.ready(f);
          out(
            Boolean(o.json),
            issues,
            () => issues.map(formatIssueLine).join("\n") || "nothing ready",
          );
        });
      }),
    );

  task
    .command("blocked")
    .description("blocked tasks and what blocks them")
    .option("--json", "print JSON")
    .action(
      action(async (o: { json?: boolean }) => {
        await withTasks(g(), (s) => {
          const rows = s.blocked();
          out(
            o.json,
            rows,
            () =>
              rows
                .map((r) => `${formatIssueLine(r.issue)}\n    blocked by ${r.blockedBy.join(", ")}`)
                .join("\n") || "nothing blocked",
          );
        });
      }),
    );

  task
    .command("update")
    .description("change fields of a task")
    .argument("<id>")
    .option("--title <text>")
    .option("-d, --description <text>")
    .option("--acceptance <text>")
    .option("--design <text>")
    .option("--notes <text>")
    .option("-p, --priority <0-4>")
    .option("-t, --type <type>")
    .option("-s, --status <status>", "open | in_progress | blocked | deferred (use close to close)")
    .option("--assignee <name>", "set assignee (empty string clears)")
    .option("--defer-until <iso>", "set defer time (empty string clears)")
    .option("--add-labels <list>")
    .option("--remove-labels <list>")
    .option("--claim", "claim for the current actor (atomic)")
    .option("--json", "print JSON")
    .action(
      action(async (id: string, o: Record<string, string | boolean | undefined>) => {
        await withTasks(g(), (s) => {
          let issue: Issue | undefined;
          if (o.claim) issue = s.claim(id);
          const u: UpdateInput = {};
          if (o.title !== undefined) u.title = String(o.title);
          if (o.description !== undefined) u.description = String(o.description);
          if (o.acceptance !== undefined) u.acceptanceCriteria = String(o.acceptance);
          if (o.design !== undefined) u.design = String(o.design);
          if (o.notes !== undefined) u.notes = String(o.notes);
          if (o.priority !== undefined) u.priority = parsePriority(String(o.priority));
          if (o.type !== undefined) u.issueType = parseType(String(o.type));
          if (o.status !== undefined) {
            const st = String(o.status);
            if (!isStatus(st) || st === "closed")
              throw new BatonError("status must be open, in_progress, blocked or deferred");
            u.status = st;
          }
          if (o.assignee !== undefined) u.assignee = String(o.assignee) || null;
          if (o.deferUntil !== undefined) u.deferUntil = String(o.deferUntil) || null;
          if (o.addLabels) u.addLabels = list(String(o.addLabels));
          if (o.removeLabels) u.removeLabels = list(String(o.removeLabels));
          const changed = Object.keys(u).length > 0;
          if (changed || !issue) issue = s.update(id, u);
          const result = issue;
          const verb =
            o.claim && !changed
              ? `claimed ${result.id} for ${result.assignee}`
              : `updated ${result.id}`;
          out(Boolean(o.json), result, () => verb);
        });
      }),
    );

  task
    .command("close")
    .description(
      "close tasks (refuses with open children, open blockers or a check: label unless --force)",
    )
    .argument("<ids...>")
    .option("-r, --reason <text>", "close reason", "Closed")
    .option(
      "-f, --force",
      "close even with open children, open blockers or a check: label (recorded as forced)",
    )
    .option("--json", "print JSON")
    .action(
      action(async (ids: string[], o: { reason: string; force?: boolean; json?: boolean }) => {
        await withTasks(g(), (s) => {
          const checked = new Set<string>();
          for (const id of ids) {
            const issue = s.get(id);
            if (!issue) continue;
            const cmds = checkCommands(issue.labels);
            if (cmds.length === 0) continue;
            if (!o.force) {
              throw new BatonError(
                `${id} has a check (${cmds.join("; ")}); close it with baton verify ${id}, or with task close --force and a reason`,
                ExitCode.Blocked,
              );
            }
            checked.add(id);
          }
          const closed = ids.map((id) =>
            s.close(
              id,
              checked.has(id) ? `forced (check not run): ${o.reason}` : o.reason,
              Boolean(o.force),
            ),
          );
          out(o.json, closed, () => closed.map((i) => `closed ${i.id}`).join("\n"));
        });
      }),
    );

  task
    .command("reopen")
    .description("reopen a closed task (clears its start, so verify counts from the next claim)")
    .argument("<id>")
    .action(
      action(async (id: string) => {
        await withTasks(g(), (s) => out(false, null, () => `reopened ${s.reopen(id).id}`));
      }),
    );

  task
    .command("delete")
    .description("delete a task (prefer close; refuses if other tasks depend on it)")
    .argument("<id>")
    .option("-f, --force", "also remove links from dependent tasks")
    .action(
      action(async (id: string, o: { force?: boolean }) => {
        await withTasks(g(), (s) => {
          s.delete(id, Boolean(o.force));
          out(false, null, () => `deleted ${id}`);
        });
      }),
    );

  const dep = task.command("dep").description("manage dependencies between tasks");
  dep
    .command("add")
    .description("<issue> depends on <depends-on>")
    .argument("<issue>")
    .argument("<depends-on>")
    .option("-t, --type <type>", DEP_TYPES.join(" | "), "blocks")
    .action(
      action(async (issue: string, dependsOn: string, o: { type: string }) => {
        if (!isDepType(o.type)) throw new BatonError(`type must be one of ${DEP_TYPES.join(", ")}`);
        const type = o.type;
        await withTasks(g(), (s) => {
          s.addDependency(issue, dependsOn, type);
          out(false, null, () => `${issue} ${type} -> ${dependsOn}`);
        });
      }),
    );
  dep
    .command("remove")
    .description("remove the link from <issue> to <depends-on>")
    .argument("<issue>")
    .argument("<depends-on>")
    .action(
      action(async (issue: string, dependsOn: string) => {
        await withTasks(g(), (s) => {
          s.removeDependency(issue, dependsOn);
          out(false, null, () => `removed ${issue} -> ${dependsOn}`);
        });
      }),
    );

  task
    .command("comment")
    .description("add a comment to a task")
    .argument("<id>")
    .argument("<text...>")
    .action(
      action(async (id: string, text: string[]) => {
        await withTasks(g(), (s) => {
          const issue = s.addComment(id, text.join(" "));
          out(false, null, () => `commented on ${issue.id} (#${issue.comments.at(-1)?.id})`);
        });
      }),
    );

  task
    .command("import")
    .description("import a Beads JSONL export (bd export [--include-memories])")
    .argument("<file>")
    .option("--overwrite", "replace tasks whose ids already exist")
    .option("--json", "print JSON")
    .action(
      action(async (file: string, o: { overwrite?: boolean; json?: boolean }) => {
        const { readFile } = await import("node:fs/promises");
        const text = await readFile(file, "utf8");
        await withTasks(g(), (s) => {
          const r = s.importBeads(text, file, Boolean(o.overwrite));
          out(o.json, r, () =>
            [
              `imported: ${r.created} created, ${r.updated} replaced, ${r.skipped} skipped, ${r.memories} memories`,
              ...r.droppedDeps.map((d) => `  dropped dependency on a missing task: ${d}`),
            ].join("\n"),
          );
        });
      }),
    );
}

/** `baton remember / recall / forget / memories`: short project facts (Beads' bd remember). */
export function registerMemory(program: Command): void {
  program
    .command("remember")
    .description("store a short project fact (shown in the session brief)")
    .argument("<text...>")
    .option("-k, --key <key>", "key (default: derived from the text)")
    .action(
      action(async (text: string[], o: { key?: string }) => {
        await withTasks({}, (s) => {
          const m = s.remember(text.join(" "), o.key);
          out(false, null, () => `remembered ${m.key}`);
        });
      }),
    );
  program
    .command("recall")
    .description("print one memory by key")
    .argument("<key>")
    .action(
      action(async (key: string) => {
        await withTasks({}, (s) => {
          const m = s.recall(key);
          if (!m) throw new BatonError(`no memory ${key}`);
          out(false, null, () => m.value);
        });
      }),
    );
  program
    .command("forget")
    .description("delete a memory by key")
    .argument("<key>")
    .action(
      action(async (key: string) => {
        await withTasks({}, (s) => {
          if (!s.forget(key)) throw new BatonError(`no memory ${key}`);
          out(false, null, () => `forgot ${key}`);
        });
      }),
    );
  program
    .command("memories")
    .description("list memories, optionally filtered by text")
    .argument("[search]")
    .option("--json", "print JSON")
    .action(
      action(async (search: string | undefined, o: { json?: boolean }) => {
        await withTasks({}, (s) => {
          const ms = s.memories(search);
          out(o.json, ms, () => ms.map((m) => `${m.key}: ${m.value}`).join("\n") || "no memories");
        });
      }),
    );
}
