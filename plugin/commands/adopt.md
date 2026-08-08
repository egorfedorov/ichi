---
description: Adopt a new ichi from an archetype
argument-hint: [archetype] [name]
---

The user wants to adopt an ichi.

1. Call the `ichi_list` MCP tool (server `ichi`) and show the archetype catalogue — unless $ARGUMENTS already names one.
2. Pick the archetype: from $ARGUMENTS if given, otherwise ask the user which one speaks to them.
3. Call `ichi_adopt` with that `archetype`, and a `name` from $ARGUMENTS if the user gave one (ask if they did not — the name is what makes the ichi theirs).
4. Show the ichi's introduction as it comes back, then follow with `ichi_brief` so the rest of the session speaks with its voice.
