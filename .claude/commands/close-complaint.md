---
description: Close a complaint with the response, and link it to an event if there was one.
---

Read CLAUDE.md. Close a complaint with the response, and link it to an event if there was one.

Run `npm run water -- close-complaint <complaint code> --response= [--event=] [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run water -- event <code>` or `npm run water -- supply <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.
