import { makeTempDir } from "./repo.js";

const DEFAULT_TIMESTAMP = "2026-10-20T10:00:00.000Z";

let counter = 0;
function nextUuid(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
}

export function userPrompt(text: string, timestamp?: string): Record<string, unknown> {
  return {
    type: "user",
    uuid: nextUuid(),
    timestamp: timestamp ?? DEFAULT_TIMESTAMP,
    message: { role: "user", content: text },
  };
}

export function toolUse(
  id: string,
  name: string,
  input: Record<string, unknown>,
  timestamp?: string,
  usage?: Record<string, number>,
): Record<string, unknown> {
  return {
    type: "assistant",
    uuid: nextUuid(),
    timestamp: timestamp ?? DEFAULT_TIMESTAMP,
    requestId: `req_${id}`,
    message: {
      id: `msg_${id}`,
      role: "assistant",
      content: [{ type: "tool_use", id, name, input }],
      ...(usage ? { usage } : {}),
    },
  };
}

export function toolResult(
  id: string,
  content: string,
  isError?: boolean,
  timestamp?: string,
): Record<string, unknown> {
  return {
    type: "user",
    uuid: nextUuid(),
    timestamp: timestamp ?? DEFAULT_TIMESTAMP,
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: id, content, is_error: isError ?? false }],
    },
  };
}

export function hookAttachment(
  attachment: Record<string, unknown>,
  timestamp?: string,
): Record<string, unknown> {
  return {
    type: "attachment",
    uuid: nextUuid(),
    timestamp: timestamp ?? DEFAULT_TIMESTAMP,
    attachment,
  };
}

/** One JSON document per line, with a trailing newline. */
export function toJsonl(records: readonly Record<string, unknown>[]): string {
  return records.map((r) => `${JSON.stringify(r)}\n`).join("");
}

/** Point CLAUDE_CONFIG_DIR at an empty temp dir so tests never read the real ~/.claude. */
export function isolateClaudeConfig(): string {
  const dir = makeTempDir("baton-claude-");
  process.env.CLAUDE_CONFIG_DIR = dir;
  return dir;
}
