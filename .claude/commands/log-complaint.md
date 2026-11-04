---
description: Log a consumer complaint: taste, odour, colour, pressure or illness.
---

Read CLAUDE.md. Log a consumer complaint: taste, odour, colour, pressure or illness.

Run `npm run water -- log-complaint --supply= --kind=taste|odour|colour|pressure|illness|other --detail= [--location=] [--on=YYYY-MM-DD] [--code=] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run water -- event <code>` or `npm run water -- supply <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.
