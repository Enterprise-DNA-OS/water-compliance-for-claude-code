---
description: Close an event once the regulator is told, any notice is lifted, the resample is clear and the corrective action is written down.
---

Read CLAUDE.md. Close an event once the regulator is told, any notice is lifted, the resample is clear and the corrective action is written down.

Run `npm run water -- close-event <event> --note= [--corrective-action=] [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run water -- event <code>` or `npm run water -- supply <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.
