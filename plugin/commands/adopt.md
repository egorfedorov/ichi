---
description: Adopt a new ichchi from an archetype
argument-hint: [archetype] [name]
---

The user wants to adopt an ichchi.

1. Call the `ichchi_list` MCP tool (server `ichchi`) and show the archetype catalogue — unless $ARGUMENTS already names one.
2. Pick the archetype: from $ARGUMENTS if given, otherwise ask the user which one speaks to them.
3. Call `ichchi_adopt` with that `archetype`, and a `name` from $ARGUMENTS if the user gave one (ask if they did not — the name is what makes the ichchi theirs).
4. Show the ichchi's introduction as it comes back, then follow with `ichchi_brief` so the rest of the session speaks with its voice.
