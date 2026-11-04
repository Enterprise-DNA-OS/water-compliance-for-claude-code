# Fixtures

Synthetic files shaped like a WaterOutlook data export and a laboratory results file, used by `npm test` and safe to try by hand:

- `wateroutlook-results.csv`: one row per result (sample point, date sampled, determinand, result, units, lab, lab reference).
- `wateroutlook-readings.csv`: one row per point, day and parameter from a treatment plant's daily summary.
- `bad-results.csv`: rows the importer must refuse (unknown point, unknown parameter, impossible date, wrong unit, a word for a number).

```bash
npm run water -- import wateroutlook --results=fixtures/wateroutlook-results.csv --readings=fixtures/wateroutlook-readings.csv --dry-run --actor="Your name"
```
