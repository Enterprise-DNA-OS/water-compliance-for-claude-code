---
description: Add an improvement action to a supply's safety plan.
---

Read CLAUDE.md. Add an improvement action to a supply's safety plan.

Run `npm run water -- add-action --supply= --hazard= --action= --owner= --due=YYYY-MM-DD [--code=] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run water -- event <code>` or `npm run water -- supply <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.
