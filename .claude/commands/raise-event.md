---
description: Open an event by hand: a treatment failure, contamination, a cluster of complaints, anything that is not a single lab result.
---

Read CLAUDE.md. Open an event by hand: a treatment failure, contamination, a cluster of complaints, anything that is not a single lab result.

Run `npm run water -- raise-event --supply= --kind=health_exceedance|aesthetic_exceedance|treatment_failure|contamination|complaints|other --description= [--point=] [--parameter=] [--detected=YYYY-MM-DD] [--code=] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the record first (`npm run water -- event <code>` or `npm run water -- supply <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.
