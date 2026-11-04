---
description: Record that the regulator was told about an event: the date, who told them and their reference.
---

Read CLAUDE.md. Record that the regulator was told about an event: the date, who told them and their reference.

Run `npm run water -- notify <event> --on=YYYY-MM-DD --by= --reference= --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run water -- event <code>` or `npm run water -- supply <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

This records a notification someone made. It never contacts the regulator. If the output says late, say so plainly.
