# Moving off WaterOutlook

WaterOutlook is set up per client, and labs send their own layouts, so every export looks a little different. This guide gets your sampling history and daily treatment summaries out, checks them, and brings them in without guessing.

## 1. Export

1. **Lab results.** From WaterOutlook (or straight from your laboratory's portal), export one row per result with: sample point, date sampled, determinand, result, units, laboratory, lab reference, sampled by and date reported. Save as CSV UTF-8.
2. **Daily treatment summaries** (optional). One row per point, day and parameter with the day's minimum, maximum and minutes out of limit, from WaterOutlook or your control system's daily report.
3. **Your schedule and plan.** The sampling schedule and safety plan actions are usually in a report or a spreadsheet. Ask Claude Code to set them up from it ("we test E. coli weekly at these six taps").

Keep the files out of the repository folder or under `imports/` (ignored by git).

## 2. Set up supplies and points

Every result belongs to a sampling point. Add your supplies and points first ("add the Riverview supply, 12,400 people, regulator Taumata Arowai, with points RVW-Z1 Hill Road hydrant and RVW-Z2 Mill Street tap"). The importer matches the export's sample point to a point code or name.

## 3. Test run

```bash
npm run water -- import wateroutlook --results=imports/results.csv --readings=imports/readings.csv --dry-run --actor="Your Name"
```

The test run reports how many samples and results are new, how many are already here, and every row it cannot map. It writes nothing.

## 4. Import

Run the same command without `--dry-run`. Each run goes in one transaction or not at all. Running it again adds nothing new: a sample with the same point, date and lab reference is skipped. Every import is logged with the file's fingerprint.

## What maps

| Export column (any of these names) | Becomes |
|---|---|
| Sample Point, Sampling Point, Site, Location, Monitoring Point | the sampling point (by code or name) |
| Date Sampled, Sample Date, Collection Date, Date | the sample date (YYYY-MM-DD or DD/MM/YYYY) |
| Determinand, Parameter, Analyte, Test | the parameter: E. coli, total coliforms, free available chlorine, turbidity, pH, nitrate, arsenic, lead, manganese, fluoride |
| Result, Value, Reading | the result; `<1` and `>200` keep their qualifier |
| Units, Unit | checked against the parameter's unit; a different unit is refused, never converted |
| Laboratory, Lab / Lab Reference, Lab Sample ID | where it was tested and the lab's number |
| Date Reported, Report Date | when the result came back |
| Min, Max, Minutes Out (readings file) | the daily treatment summary |

Rows from the same point, date and lab reference become one sample with several results.

## What does not carry over

- **Live control system feeds.** WaterOutlook takes data from SCADA in real time. This system takes the daily summary. Live alarms stay in your control system; Enterprise DNA can connect a feed if you want one here.
- **Imported detections are not raised as new events.** The old system may already hold the event, the notification and the notice. The import lists them, and `/attention` shows each as a health result with no event until someone raises or reviews it.
- **Carbon, energy and plant KPI modules.** Not part of this system.
- **Attachments** (lab certificates, photos). Keep the files; add a field for the link if you want one (`/customise`).
- **Parameters beyond the ten built in.** Add a row to `parameters` and its limit to `standards` first (`/customise`), then import.
