<h1 align="center">Water Compliance for Claude Code</h1>

<p align="center">
  <strong>The open-source drinking water compliance system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your WaterOutlook data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=wateroutlook">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/wateroutlook?utm_source=github&utm_medium=readme&utm_campaign=wateroutlook">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-wateroutlook">Instead of WaterOutlook</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Water Compliance for Claude Code does the compliance job you pay WaterOutlook for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it can answer questions the WaterOutlook dashboard cannot.

WaterOutlook does not publish a price. It sells an enterprise cloud platform for operational and compliance data, quoted per client, and says it collects data from more than 13,000 plants and over 3,700 users ([wateroutlook.com/about-us](https://www.wateroutlook.com/about-us), checked 2026-11-04). A small supplier that only needs to prove its water is safe ends up renting a platform built for SCADA feeds and carbon accounting.

Want the same thing with a web front end, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=wateroutlook).

It is drinking water compliance for anyone who supplies water to other people: council water services and the new water organisations, rural water schemes, campgrounds and holiday parks, schools, marae, retirement villages and industrial sites with their own bore. It holds every supply, sampling point, sampling schedule, sample and lab result, checks each result against the New Zealand standards or the Australian Drinking Water Guidelines, and opens an event the moment a result breaches a health limit. Each event then tracks the duties that follow: tell the regulator, resample, issue and lift a boil water notice, fix the cause and close it out. The safety plan's improvement actions, consumer complaints and daily treatment readings sit alongside.

### Ten questions WaterOutlook will not answer for you

These run against the demo data today. Ask them in plain words.

1. Which E. coli detections has nobody told the regulator about yet?
2. Which boil water notices could come off today because a clear resample is already back?
3. Which health results have no event raised against them?
4. Which scheduled tests are overdue this week, and at which taps?
5. How many days, on average, do we take to tell the regulator after a detection, by supply?
6. Which samples have been at the lab for more than five days?
7. Which treatment plants ran over their turbidity limit this week, and for how many minutes?
8. Which safety plan actions are overdue, and who owns them?
9. Which illness complaints came in near a low chlorine result?
10. Which supplies have no registration or an overdue safety plan review?

### Your first hour: ten things to ask for

1. "What needs attention this week?" (`/attention`)
2. "Set up our supply: the Riverview town scheme, 12,400 people, two bores, one treatment plant and four sample taps."
3. "We test E. coli weekly at every network tap and nitrate quarterly at the bores." (`/customise` writes the schedule)
4. "Bring across last year's results from WaterOutlook." (`/import`, test run first)
5. "Print the sampling run for this week." (`/due`, or `npm run view` for the printable page)
6. "The lab says E. coli 2 at Mill Street on sample S-RVW-Z2-E1." (`/result` opens the event)
7. "Draft the notification to Taumata Arowai for EV-0003." (`/draft-notification`)
8. "Can the boil water notice on Tarawera come off?" (`/lift-notice` says what is missing)
9. "Put our logo and colours on the event reports." (edit `brand.json`, then `npm run docs`)
10. "Write the Monday water review." (`/weekly-review`)

### Documents and views

- `npm run docs` renders an event report for every event (the trigger, the notification, the notice, the resample and every step) and a monthly summary for every supply, in your brand (`brand.json`), into `docs-out/`.
- `npm run view` renders the week, the sampling run and the events and notices as read-only HTML pages into `views/`.
- `/compliance` checks the records against the rules in [docs/compliance.md](docs/compliance.md), each with its source.
- `/draft-notice`, `/draft-notification` and `/annual-report` write drafts to `drafts/`. Nothing is ever sent or lodged from here.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No seats, no tiers, no add-ons. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/water-compliance-for-claude-code.git
cd water-compliance-for-claude-code
npm install
npm run demo
```

Then open the folder in Claude Code and type `/attention`. On the demo data it finds an E. coli detection at a town supply that the regulator has not been told about, a campground tap with a positive result and no event, and a rural scheme's boil water notice that could come off because the resample is clear.

Or from the terminal: `npm run water -- attention`.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee.

## The commands

| Command | What it does |
|---|---|
| `/attention` | What needs a person this week: detections nobody owns, untold events, notices in force, late resamples, missed sampling. |
| `/supplies`, `/supply` | Every supply, or everything about one: points, schedule, attention, events. |
| `/points`, `/schedule`, `/due` | Sampling points, the full schedule, and the run list for the next 7 days. |
| `/sample` | Record a sample taken in the field. |
| `/result` | Record a lab result. A health limit breach opens an event in the same step. |
| `/void` | Void an unusable sample with a reason. Results are never edited. |
| `/results`, `/exceedances` | Recent results with verdicts, and every result over a limit in the last year. |
| `/events`, `/event` | Every event, or one event in full. |
| `/raise-event` | Open an event by hand: treatment failure, contamination, complaints. |
| `/notify` | Record that the regulator was told, with their reference. |
| `/notice`, `/notices` | Record a boil water or do not drink notice; list those in force. |
| `/resample` | Link the follow-up sample to an event. |
| `/lift-notice` | Lift a notice, refused until a clear resample taken after it is on file. |
| `/close-event` | Close an event once told, lifted, clear and fixed. |
| `/plan`, `/add-action`, `/complete-action`, `/review-plan` | The safety plan's improvement actions and its review date. |
| `/register` | Record a supply's registration with the regulator. |
| `/complaints`, `/log-complaint`, `/close-complaint` | Consumer complaints, linked to events. |
| `/treatment` | Days a treatment plant reading went out of limit. |
| `/lab` | Samples still at the lab and each lab's turnaround. |
| `/stats` | By supply: samples, E. coli tests, detections, events, days to notify. |
| `/standards` | The limits in force and where each comes from. |
| `/compliance` | The records checked against the rules in docs/compliance.md. |
| `/draft-notice` | The consumer boil water or do not drink notice, drafted from the event. |
| `/draft-notification` | The notification to the regulator, drafted from the event. |
| `/annual-report` | A supply's annual summary: results by parameter, events, complaints. |
| `/weekly-review` | The Monday review, written from attention, open events and the sampling run. |
| `/import`, `/export` | Bring results and daily readings across from WaterOutlook or a lab; snapshot every table. |
| `/activity`, `/help` | The append-only log, and every command. |
| `/customise`, `/new-view` | Change a field, limit or schedule; add a printable page. |

## Instead of WaterOutlook

WaterOutlook data exports and laboratory results files are set up per client, so the importer accepts the common column names (sample point, date sampled, determinand, result, units, lab, lab reference) and refuses anything it cannot map rather than guessing. Daily treatment summaries (minimum, maximum, minutes out of limit) come in the same way. Always run a test first:

```bash
npm run water -- import wateroutlook --results=imports/results.csv --readings=imports/readings.csv --dry-run --actor="Your Name"
```

Imported detections are listed for review rather than raised as new events, because the old system may already hold them. The full guide, with what maps and what does not carry over: [docs/replace-wateroutlook.md](docs/replace-wateroutlook.md).

## Architecture

```
water-compliance-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/                  the CLI the commands drive
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  docs/                     the thesis and the migration guide
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Water Compliance for Claude Code for your business, migrates your WaterOutlook data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=wateroutlook)
- Read more: [enterprisedna.co/omni/instead-of/wateroutlook](https://enterprisedna.co/omni/instead-of/wateroutlook?utm_source=github&utm_medium=readme&utm_campaign=wateroutlook)

## License

MIT. Copyright (c) 2026 Enterprise DNA.
