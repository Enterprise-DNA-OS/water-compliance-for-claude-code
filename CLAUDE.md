# Water Compliance for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR BUSINESS]
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a record, read its full history first.
3. **Plain language.** Short sentences. No filler. Numbers in tables.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a customer waits for a yes in this session.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| What needs attention this week | `/attention` |
| Everything about one supply or one event | `/supply`, `/event` |
| What to sample this week | `/due` (full schedule: `/schedule`) |
| A sample was taken | `/sample` |
| A lab result came back | `/result` (opens an event on a health breach) |
| A sample is unusable | `/void` |
| Recent results, anything over a limit | `/results`, `/exceedances` |
| Something went wrong that is not one result | `/raise-event` |
| We told the regulator | `/notify` |
| A boil water or do not drink notice went out | `/notice`, then `/draft-notice` |
| The follow-up sample | `/resample` |
| Can the notice come off | `/lift-notice` |
| Close an event | `/close-event` |
| Events and notices in force | `/events`, `/notices` |
| Safety plan actions and review | `/plan`, `/add-action`, `/complete-action`, `/review-plan` |
| Registration with the regulator | `/register` |
| A consumer complaint | `/log-complaint`, `/complaints`, `/close-complaint` |
| Treatment plant out of limit | `/treatment` |
| Lab turnaround | `/lab` |
| How each supply is doing | `/stats` |
| What limits apply | `/standards` |
| Are we compliant | `/compliance` |
| Draft the notification to the regulator | `/draft-notification` |
| The annual summary | `/annual-report` |
| The Monday review | `/weekly-review` |
| Bring data across from WaterOutlook or a lab | `/import` (test run first) |
| A full copy of the data | `/export` |
| Who recorded what | `/activity` |
| Change a field, limit or schedule | `/customise` |
| A new printable page | `/new-view` |

If an ask fits nothing here, run the CLI directly (`npm run water -- help`) and then propose a new command for it.

## Hard rules

- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Prefer marking closed or archived.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- The database is the source of truth. If the answer is not in it, say so.
- A lab result is never edited or deleted. A wrong result means voiding the sample with a reason and recording the resample.
- A health limit breach is raised to the operator the moment it is recorded: say the regulator needs telling, a resample is due and a notice may be needed. Never decide on a notice for them.
- Nothing here contacts the regulator or consumers. Notifications and notices are drafted; a person lodges or publishes them and then records it with `/notify` or `/notice`.
- The limits and rules live in `standards` and `docs/compliance.md`. Never change a limit without the operator naming the source.

## Where things live

- `scripts/` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` the thesis and the guide for moving off WaterOutlook.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/wateroutlook
