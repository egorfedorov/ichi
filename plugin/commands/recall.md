---
description: Search the ichi's memories — what it remembers about a topic
argument-hint: <what to remember>
---

Call the `ichi_recall` MCP tool (server `ichi`) with:
- `ichi`: the ichi from this session's brief (call `ichi_list` first if you do not know it)
- `query`: $ARGUMENTS — if empty, ask the user what the ichi should try to remember

Show the memories it returns. If it remembers nothing, say so plainly and mention that `/ichi:praise`, `/ichi:scold` and `ichi_remember` are how things get saved.
