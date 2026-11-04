---
description: Record a lab result against a sample. A result over a health limit opens an event in the same step.
---

Read CLAUDE.md. Record a lab result against a sample. A result over a health limit opens an event in the same step.

Run `npm run water -- result <sample> --parameter= --value= [--qualifier=<|=|>] [--reported=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run water -- event <code>` or `npm run water -- supply <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

A non-detect such as "<1" is `--qualifier=< --value=1`. If the output says an event was opened, stop and tell the operator straight away: the regulator needs telling, a resample is due and a notice to consumers may be needed. Offer `/draft-notification` and `/draft-notice`.
