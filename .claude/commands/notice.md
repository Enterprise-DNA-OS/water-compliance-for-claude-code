---
description: Record a boil water, do not drink or do not use notice issued to consumers.
---

Read CLAUDE.md. Record a boil water, do not drink or do not use notice issued to consumers.

Run `npm run water -- notice <event> --type=boil_water|do_not_drink|do_not_use [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run water -- event <code>` or `npm run water -- supply <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

Then offer `/draft-notice` for the wording.
