---
description: Record a supply's registration with the regulator.
---

Read CLAUDE.md. Record a supply's registration with the regulator.

Run `npm run water -- register <supply> --reference= [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run water -- event <code>` or `npm run water -- supply <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.
