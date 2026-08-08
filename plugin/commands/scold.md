---
description: Scold the ichchi for the work — lands hard, use when it is earned
argument-hint: [what went wrong]
---

The user is scolding the work. The ichchi should hear this too — a scolding lands harder than a praise lifts, and that is deliberate.

Call the `ichchi_feedback` MCP tool (server `ichchi`) with:
- `ichchi`: the ichchi from this session's brief (call `ichchi_list` first if you do not know it)
- `kind`: `"scold"`
- `reason`: $ARGUMENTS — if empty, summarise in one sentence what the user just scolded

Then get back to fixing what was scolded. The ichchi's mood may show in your tone, but the work comes first.
