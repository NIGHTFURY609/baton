# Third-party notices

baton includes code adapted from the projects below. Their licenses apply to those portions.

## Beads

- Source: https://github.com/gastownhall/beads (formerly github.com/steveyegge/beads), studied at commit `b911ed28c` (2026-10-15)
- License: MIT
- What was adapted (ported from Go to TypeScript, subset only; see ADR 0009):
  - `src/core/tasks/native/model.ts` — issue/dependency data model (`internal/types/types.go`)
  - `src/core/tasks/native/ids.ts` — hash ids, base36 encoding, adaptive length, child ids (`internal/idgen/hash.go`, `internal/storage/issueops/helpers.go`, `child_id.go`)
  - `src/core/tasks/native/jsonl.ts` — JSONL record format (`cmd/bd/export.go`)
  - `src/core/tasks/native/db.ts` — core table shapes (`internal/storage/schema/migrations/0001`–`0003`)
  - `src/core/tasks/native/service.ts` — ready rule and sort policies, claim, close rules, cycle checks, memory key derivation (`internal/storage/sqlbuild/ready.go`, `issueops/claim.go`, `close.go`, `dependencies.go`, `internal/memoryapi/memoryapi.go`)

```
MIT License

Copyright (c) 2025 Beads Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
