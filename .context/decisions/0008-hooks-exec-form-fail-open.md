---
id: adr-0008
kind: decision
status: accepted
date: 2026-10-16
decision-makers: [maintainer]
verified_at: null
source_paths: [plugin/hooks/hooks.json, src/hooks/**]
spec_sections: [hooks]
---
# Hooks run as exec-form `node`, fail open, and guard the shell too

## Context and Problem Statement

Hooks must work on Windows, macOS and Linux, must never wedge a session when baton has a bug, and must not be trivially bypassed.

## Decision Outcome

* Every hook is `node ${CLAUDE_PLUGIN_ROOT}/dist/baton.mjs hook <event>` in exec form (`command` + `args`), with no shell script, so Windows needs no bash.
* The dispatcher catches every error, reports it on stderr and exits 0. Only a structured `deny` (PreToolUse) or `block` (Stop) changes agent behaviour; exit code 2 is not used, so the deny reason reaches the model verbatim.
* PreToolUse guards cover edit tools **and** the shell tool (`Bash`, `run_shell_command`, `apply_patch`), since `sed -i` or `>` bypasses an edit-only guard. False positives are acceptable; the deny names the CLI command to use instead.
* Matchers are plain `A|B|C` lists, never regex, because regex matchers are unanchored.

### Consequences

* Good, because a broken release degrades to "no continuity", not "agent cannot work".
* Bad, because a silently failing hook can go unnoticed; `stats` reports hook errors (Phase 1).
