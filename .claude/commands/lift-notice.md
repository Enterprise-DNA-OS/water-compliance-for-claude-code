---
description: Lift a notice to consumers. Refused until a clear resample taken after the notice is on file.
---

Read CLAUDE.md. Lift a notice to consumers. Refused until a clear resample taken after the notice is on file.

Run `npm run water -- lift-notice <event> [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run water -- event <code>` or `npm run water -- supply <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

If it is refused, say exactly what is missing.
