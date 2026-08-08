---
description: Search the ichchi's memories — what it remembers about a topic
argument-hint: <what to remember>
---

Call the `ichchi_recall` MCP tool (server `ichchi`) with:
- `ichchi`: the ichchi from this session's brief (call `ichchi_list` first if you do not know it)
- `query`: $ARGUMENTS — if empty, ask the user what the ichchi should try to remember

Show the memories it returns. If it remembers nothing, say so plainly and mention that `/ichchi:praise`, `/ichchi:scold` and `ichchi_remember` are how things get saved.
