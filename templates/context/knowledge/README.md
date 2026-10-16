# Knowledge

One file per topic (`<topic>.md`), each with frontmatter:

```yaml
---
id: knowledge-<topic>
kind: knowledge
verified_at: null
source_paths: []
---
```

One fact per bullet. Append during work (the `checkpoint` skill does this); `baton drift` flags oversized or orphaned topics for compaction. Topics load on demand, never by default.
