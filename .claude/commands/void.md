---
description: Void a sample that cannot be used (broken bottle, lab error), with the reason.
---

Read CLAUDE.md. Void a sample that cannot be used (broken bottle, lab error), with the reason.

Run `npm run water -- void <sample> --reason= --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run water -- event <code>` or `npm run water -- supply <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

A sample that triggered an event cannot be voided. Results are never edited; a wrong result means void and resample.
