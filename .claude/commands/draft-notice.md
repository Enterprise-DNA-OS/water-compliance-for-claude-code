---
description: Draft the boil water or do not drink notice for consumers from the event record.
---

Read CLAUDE.md. Draft the boil water or do not drink notice for consumers from the event record.

Run `npm run water -- draft-notice <event>`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Writes a draft to drafts/. Read it, present the path and the lines the operator must fill in. Never publish or send it.
