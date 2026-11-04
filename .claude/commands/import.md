---
description: Import results and daily readings exported from WaterOutlook or a laboratory.
---

Read CLAUDE.md. Import results and daily readings exported from WaterOutlook or a laboratory.

Run `npm run water -- import wateroutlook [--results=results.csv] [--readings=readings.csv] [--dry-run] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read docs/replace-wateroutlook.md first. Always run with --dry-run, show the counts and problems, then import within the operator's authorised migration. Never guess a column. List any health results the import reports for review.
