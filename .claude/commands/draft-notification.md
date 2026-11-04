---
description: Draft the notification to the regulator from the event record.
---

Read CLAUDE.md. Draft the notification to the regulator from the event record.

Run `npm run water -- draft-notification <event>`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Writes a draft to drafts/. Never lodge or send it. After the operator lodges it, record it with `/notify`.
