# Compliance rules

`/compliance` (or `npm run water -- compliance`) checks the records against the rules below. Each rule names its source, what a breach looks like in the data, and the check that finds it. The limits each result is held to live in the `standards` table (`/standards`), each row with its own source.

This is a record-keeping check, not legal advice. The supplier stays responsible for its water. When a rule changes, update this file, the check in `scripts/water.mjs` and the `standards` rows together (`/customise`), and say where the new rule comes from.

Sources were read on 2026-11-04. New Zealand legislation was read as amended by the Local Government (Water Services) (Repeals and Amendments) Act 2025, in force 27 August 2025, which renamed the regulator Water Services Authority, Taumata Arowai.

| Rule | Source | Breach in the data | Check |
|---|---|---|---|
| EVENT-FOR-DETECTION | NZ: Water Services Act 2021 s 21(2) and s 22(2) (immediate action when water is or may be unsafe, or breaches a standard). Vic: Safe Drinking Water Act 2003 s 18. | A result over a health limit with no event raised against it. `/result` opens the event itself; imported history and hand edits are what this catches. | `result_check` where the verdict is a health breach and no event points at the result |
| NOTIFY-REGULATOR | NZ: Water Services Act 2021 s 21(2)(b) and s 22(2)(b) (notify the regulator), s 35(2) (notifiable risks and hazards, immediately). Vic: Safe Drinking Water Act 2003 s 18 (in writing within 10 days of becoming aware of non-compliance), s 22(2) (known or suspected contamination, immediately); Safe Drinking Water Regulations 2025 reg 20 (written summary of a failed result within 10 days). | A health exceedance, contamination or treatment failure not notified within the supply's `notify_within_days`, or notified later than that. | `event_register` against `supplies.notify_within_days` |
| RESAMPLE | NZ: Water Services Act 2021 s 22(2)(a) (immediate action); Vic: ADWG Table 10.5 (E. coli detected: immediate corrective action). House rule: an E. coli event is not finished until a follow-up sample shows clear. | An E. coli event with no linked resample, or a resample without a clear E. coli result. | `events.resample_id` joined to `result_check` |
| NOTICE-LIFT | NZ: Water Services Act 2021 s 21(2)(f) and s 22(2)(f) (advise affected consumers what to do, for example boiling). House rule: a notice comes off only on evidence. | A boil water, do not drink or do not use notice lifted with no clear resample taken after the notice went out. `/lift-notice` refuses this; the check catches hand edits. | `events` notice dates against the resample |
| SAMPLING-FREQUENCY | NZ: Drinking Water Quality Assurance Rules 2022 (the module for the supply's size, for example D3.29 for networks over 500 people). Vic: your risk management plan (Safe Drinking Water Act 2003 s 7). | A scheduled test past its next due date. The schedule's `basis` column says which rule or plan set the frequency. | `sampling_due` |
| SAMPLING-GAP | NZ: Drinking Water Quality Assurance Rules 2022 D3.29 and Table 39 (each zone under 25,000 people: one E. coli sample a week, no more than 9 days apart). | More than 9 days between E. coli samples at a network point of a New Zealand supply serving over 500 people, in the last 90 days. | window over E. coli samples per point |
| SAFETY-PLAN | NZ: Water Services Act 2021 s 30 (prepare, lodge and implement a drinking water safety plan; not required for 25 consumers or fewer, s 30(1A)). Vic: Safe Drinking Water Act 2003 s 7 (prepare, implement and review a risk management plan). NSW: Public Health Act 2010 s 25 (quality assurance program). The review interval is yours to set in `plan_review_months`. | No plan review on record, or the last review older than the interval. | `supplies.plan_reviewed_on` |
| REGISTRATION | NZ: Water Services Act 2021 s 23 (every drinking water supply must be registered), s 56 (re-register every 5 years). Existing supplies that were not registered on 15 November 2021 have until 15 November 2028 to register and until 15 November 2030 to provide a safety plan (Schedule 1 cl 6, as amended in 2025). | An active supply with no registration recorded. Housekeeping until the deadline, then a breach. | `supplies.registration_ref` |
| RECORDS | NZ: Water Services Act 2021 s 37(1) (keep records of the supply, its operation and monitoring results). Small to Medium Networks Acceptable Solution 2025, SMN.19 (keep records for 3 years). | A microbiological or chemical result with no laboratory recorded. | `samples.lab` |

## Limits in the standards table

- **New Zealand:** Water Services (Drinking Water Standards for New Zealand) Regulations 2022, regulation 4 and the Schedule. E. coli less than 1 in 100 mL (Table 1). Nitrate 50 mg/L short-term as nitrate, arsenic 0.01, lead 0.01, manganese 0.4, fluoride 1.5, chlorine 5 mg/L (Table 2). Total coliforms have no maximum acceptable value; they are monitored under the assurance rules.
- **New Zealand operational limits** come from the Drinking Water Quality Assurance Rules 2022: free available chlorine in the network at least 0.2 mg/L in 85% of samples and never below 0.1 (D3.19); turbidity after chlorine treatment under 1.0 NTU for 95% of each day and never over 2.0 NTU for 15 minutes (T3). The check flags any single result under 0.2 mg/L or over 1.0 NTU; the percentage tests are worked out over the period when you ask.
- **Australia:** Australian Drinking Water Guidelines 2011, version 4.0 (June 2025). E. coli not detected in 100 mL (Table 10.5). Nitrate 50 mg/L as nitrate, arsenic 0.01, lead 0.005 (lowered in June 2025), manganese 0.1 health and 0.05 aesthetic, fluoride 1.5, chlorine 5 mg/L, turbidity 5 NTU aesthetic (Table 10.6). Victoria applies these through the Safe Drinking Water Regulations 2025 reg 16 (in force 6 July 2025; the 2015 regulations are revoked).

## Reporting dates (for `/annual-report`)

- **New Zealand:** monitoring data to the regulator every 6 months, 3 months or monthly for level 1, 2 and 3 suppliers (DWQAR 2022 G1 to G3); the yearly report within 40 working days of the end of the calendar year (G4, G5). The Water Services (Drinking Water Quality Assurance) Rules 2026 replace the 2022 rules from 1 July 2027 and move the rules year to 1 July to 30 June; check the schedule then.
- **Victoria:** an annual report to the Secretary for each financial year by 31 October, made public (Safe Drinking Water Act 2003 s 26). `/annual-report` uses the financial year for Australian supplies.

## What changed in 2025 that older tools may still assume

- The 2022 Spring and Bore, Roof Water and Mixed-use Rural Acceptable Solutions were revoked on 5 September 2025 and replaced by the Small to Medium Networks (500 people or fewer), Mixed-use Rural and Self-supplied Buildings Acceptable Solutions 2025. A supplier meeting one of them is deemed to comply with the safety plan and assurance rule duties it covers.
- Household supplies serving 25 people or fewer are no longer drinking water supplies under the Act.
- The registration deadline for existing unregistered supplies moved from 15 November 2025 to 15 November 2028.

## Where each was read

- Water Services Act 2021: https://legislation.govt.nz/act/public/2021/0036/latest/whole.html
- Drinking Water Standards Regulations 2022: https://www.legislation.govt.nz/regulation/public/2022/0168/latest/whole.html
- Assurance rules, Acceptable Solutions and the 2025 changes: https://www.taumataarowai.govt.nz/about-us/legislation/water-services-legislation-changes
- Australian Drinking Water Guidelines: https://www.nhmrc.gov.au/about-us/publications/australian-drinking-water-guidelines
- Safe Drinking Water Act 2003 (Vic): https://content.legislation.vic.gov.au/sites/default/files/2025-02/03-46aa017-authorised.pdf
- Safe Drinking Water Regulations 2025 (Vic): https://content.legislation.vic.gov.au/sites/default/files/2026-07/25-60sra002-authorised.pdf
- Public Health Act 2010 (NSW): https://legislation.nsw.gov.au/view/whole/html/inforce/current/act-2010-127

Not settled from the sources: a fixed number of hours for telling the New Zealand regulator about a failed result. The Act says immediate action and notify; the regulator's guidance sets the practice. `notify_within_days` is 1 for New Zealand supplies in the demo, and you set it for yours.
