---
description: Record a sample taken in the field, before the lab result is back.
---

Read CLAUDE.md. Record a sample taken in the field, before the lab result is back.

Run `npm run water -- sample --point= --on=YYYY-MM-DD --by= [--lab=] [--lab-ref=] [--code=] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run water -- event <code>` or `npm run water -- supply <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.
