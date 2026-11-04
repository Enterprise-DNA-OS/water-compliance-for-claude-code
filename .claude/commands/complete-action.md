---
description: Mark a safety plan action done, with the evidence.
---

Read CLAUDE.md. Mark a safety plan action done, with the evidence.

Run `npm run water -- complete-action <action code> --evidence= [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run water -- event <code>` or `npm run water -- supply <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.
