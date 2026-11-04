#!/usr/bin/env node
// The one CLI for Water Compliance for Claude Code.
//
//   npm run water -- help
//   npm run water -- attention            # what needs a person this week
//   npm run water -- event EV-0003        # one event, everything about it
//   npm run water -- results --json       # machine output for any read
//
// Every write needs --actor=<who is doing it> and lands in the append-only activity log.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick } from './lib/csv.mjs';
import { table as textTable, heading, truncate } from './lib/format.mjs';

// ------------------------------------------------------------------ reads

export const reads = {
  supplies: {
    about: 'Every supply: country, regulator, people served, registration and safety plan review.',
    sql: `select code, name, country, supply_type as type, population, regulator, coalesce(registration_ref, 'not registered') as registration,
            plan_reviewed_on, (plan_reviewed_on + make_interval(months => plan_review_months))::date as plan_review_due
          from supplies where active order by code`,
  },
  points: {
    about: 'Sampling points by supply: sources, treatment, reservoirs and the network.',
    sql: `select p.code, s.code as supply, p.name, p.kind from points p join supplies s on s.id = p.supply_id where p.active order by s.code, p.kind, p.code`,
  },
  schedule: {
    about: 'Every scheduled test: how often, last taken, next due.',
    sql: `select supply, point, parameter, every_days, last_sampled, next_due, days_overdue from sampling_due order by next_due, supply, point, parameter`,
  },
  due: {
    about: 'Samples overdue or due in the next 7 days: the sampling run list.',
    sql: `select supply, point, point_name, parameter, next_due, days_overdue from sampling_due
          where next_due <= current_date + 7 order by next_due, supply, point, parameter`,
  },
  results: {
    about: 'Results from the last 30 days with the verdict against each limit.',
    sql: `select sample, sampled_on, supply, point, parameter,
            case when qualifier = '=' then '' else qualifier end || value as result, unit, verdict
          from result_check where sampled_on >= current_date - 30 order by sampled_on desc, sample, parameter`,
  },
  exceedances: {
    about: 'Every result over a health, operational or aesthetic limit in the last year, and whether an event covers it.',
    sql: `select sample, sampled_on, supply, point, parameter, case when qualifier = '=' then '' else qualifier end || value as result, unit, verdict,
            case when has_event then 'yes' else 'NO' end as event
          from result_check where verdict <> 'ok' and sampled_on >= current_date - 365 order by sampled_on desc, sample`,
  },
  events: {
    about: 'Every event: what happened, when the regulator was told, notices and resamples.',
    sql: `select code, supply, point, replace(kind, '_', ' ') as kind, parameter, detected_on, notified_on, days_to_notify,
            replace(notice, '_', ' ') as notice, notice_on, notice_lifted_on, resample, status, days_open
          from event_register order by detected_on desc, code`,
  },
  notices: {
    about: 'Boil water and do not drink notices in force, and how long.',
    sql: `select code, supply, supply_name, replace(notice, '_', ' ') as notice, notice_on, current_date - notice_on as days_in_force, resample, resample_status
          from event_register where notice_in_force order by notice_on`,
  },
  attention: {
    about: 'What needs a person this week: unreported detections, notices, late resamples, missed sampling, overdue plan actions.',
    sql: `select supply, item, rule, detail, days from supply_attention order by severity, days desc nulls last, supply, item`,
  },
  plan: {
    about: 'Open safety plan improvement actions, with owner and due date.',
    sql: `select a.code, s.code as supply, a.hazard, a.action, a.owner, a.due, greatest(current_date - a.due, 0) as days_overdue
          from plan_actions a join supplies s on s.id = a.supply_id where a.done_on is null order by a.due, a.code`,
  },
  complaints: {
    about: 'Consumer complaints still open.',
    sql: `select c.code, s.code as supply, c.received_on, c.kind, c.location, c.detail, current_date - c.received_on as days_open
          from complaints c join supplies s on s.id = c.supply_id where c.closed_on is null order by c.received_on, c.code`,
  },
  treatment: {
    about: 'Days in the last 30 when a treatment reading went out of limit.',
    sql: `select s.code as supply, p.code as point, d.reading_on, d.parameter, d.min_value, d.max_value, d.minutes_out
          from daily_readings d join points p on p.id = d.point_id join supplies s on s.id = p.supply_id
          where d.minutes_out > 0 and d.reading_on >= current_date - 30 order by d.reading_on desc, p.code`,
  },
  lab: {
    about: 'Samples still at the lab, and lab turnaround by lab over the last 90 days.',
    sql: `select lab, count(*) filter (where status = 'at_lab')::int as waiting,
            min(sampled_on) filter (where status = 'at_lab') as oldest_waiting,
            count(*) filter (where status = 'reported' and sampled_on >= current_date - 90)::int as reported_90d,
            round(avg(reported_on - sampled_on) filter (where status = 'reported' and sampled_on >= current_date - 90), 1)::float as avg_days
          from samples where lab is not null group by lab order by waiting desc, lab`,
  },
  stats: {
    about: 'By supply over 90 days: samples, E. coli tests and detections, events and days to notify.',
    sql: `select su.code as supply, su.country,
            (select count(*) from samples s join points p on p.id = s.point_id where p.supply_id = su.id and s.status <> 'void' and s.sampled_on >= current_date - 90)::int as samples,
            (select count(*) from result_check r where r.supply = su.code and r.parameter = 'ECOLI' and r.sampled_on >= current_date - 90)::int as ecoli_tests,
            (select count(*) from result_check r where r.supply = su.code and r.parameter = 'ECOLI' and r.verdict = 'over health limit' and r.sampled_on >= current_date - 90)::int as detections,
            (select count(*) from events e where e.supply_id = su.id and e.detected_on >= current_date - 90)::int as events,
            (select round(avg(days_to_notify), 1)::float from event_register e where e.supply = su.code and e.days_to_notify is not null) as avg_days_to_notify,
            (select count(*) from sampling_due d where d.supply = su.code and d.days_overdue > 0)::int as overdue_tests
          from supplies su where su.active order by su.code`,
  },
  standards: {
    about: 'The limits each country holds a result to, and where each comes from.',
    sql: `select country, parameter, kind, min_value, max_value, source from standards order by country, parameter, kind`,
  },
  compliance: {
    about: 'Check the records against the rules in docs/compliance.md.',
    sql: null,
  },
  activity: {
    about: 'The append-only log of who changed what.',
    sql: `select created_at, actor, command, record_id, detail from activity order by id`,
  },
};

// Each rule matches a row in docs/compliance.md.
export const complianceRules = [
  { rule: 'EVENT-FOR-DETECTION', sql: `select sample as code, point || ' ' || parameter || ' ' || case when qualifier = '=' then '' else qualifier end || value || ' ' || unit || ', no event raised' as finding
      from result_check where verdict in ('over health limit','under health minimum') and not has_event` },
  { rule: 'NOTIFY-REGULATOR', sql: `select code, case when notified_on is null then 'detected ' || detected_on || ', ' || regulator || ' not told'
        else 'told ' || days_to_notify || ' days after detection' end as finding
      from event_register where kind in ('health_exceedance','contamination','treatment_failure')
        and ((notified_on is null and status = 'open' and current_date - detected_on > notify_within_days) or days_to_notify > notify_within_days)` },
  { rule: 'SAMPLING-GAP', sql: `with e as (
        select p.code as point, s.sampled_on, lead(s.sampled_on, 1, current_date) over (partition by p.id order by s.sampled_on) as next_on
        from samples s join points p on p.id = s.point_id join supplies su on su.id = p.supply_id
        join results r on r.sample_id = s.id and r.parameter = 'ECOLI'
        where su.country = 'NZ' and su.population > 500 and p.kind = 'distribution' and s.status <> 'void' and s.sampled_on >= current_date - 90)
      select point as code, (next_on - sampled_on) || ' days between E. coli samples from ' || sampled_on as finding from e where next_on - sampled_on > 9` },
  { rule: 'RESAMPLE', sql: `select e.code, case when e.resample is null then 'no resample recorded' else 'resample ' || e.resample || ' has no clear E. coli result' end as finding
      from event_register e where e.kind = 'health_exceedance' and e.parameter = 'ECOLI'
        and not exists (select 1 from events x join results r on r.sample_id = x.resample_id and r.parameter = 'ECOLI'
          join result_check c on c.result_id = r.id where x.code = e.code and c.verdict = 'ok')` },
  { rule: 'NOTICE-LIFT', sql: `select e.code, 'notice lifted ' || e.notice_lifted_on || ' with no clear resample after the notice' as finding
      from events e where e.notice_lifted_on is not null and not exists (
        select 1 from samples s join results r on r.sample_id = s.id join result_check c on c.result_id = r.id
        where s.id = e.resample_id and s.sampled_on >= e.notice_on and c.verdict = 'ok')` },
  { rule: 'SAMPLING-FREQUENCY', sql: `select point || ' ' || parameter as code, 'every ' || every_days || ' days, ' || days_overdue || ' days overdue' as finding
      from sampling_due where days_overdue > 0` },
  { rule: 'SAFETY-PLAN', sql: `select code, case when plan_reviewed_on is null then 'no safety plan review recorded'
        else 'plan review due ' || (plan_reviewed_on + make_interval(months => plan_review_months))::date end as finding
      from supplies where active and (plan_reviewed_on is null or (plan_reviewed_on + make_interval(months => plan_review_months))::date < current_date)` },
  { rule: 'REGISTRATION', sql: `select code, 'no registration with ' || regulator || ' recorded' as finding from supplies where active and registration_ref is null` },
  { rule: 'RECORDS', sql: `select s.code, 'sampled ' || s.sampled_on || ' but no laboratory recorded for a ' || string_agg(distinct pa.name, ', ') || ' result' as finding
      from samples s join results r on r.sample_id = s.id join parameters pa on pa.code = r.parameter
      where s.status <> 'void' and pa.category in ('microbiological','chemical') and s.lab is null group by s.code, s.sampled_on` },
];

// ------------------------------------------------------------------ usage

export const usage = {
  ...Object.fromEntries(Object.keys(reads).map((k) => [k, ''])),
  supply: '<supply code or name words>',
  event: '<event code>',
  sample: '--point= --on=YYYY-MM-DD --by= [--lab=] [--lab-ref=] [--code=] --actor=',
  result: '<sample> --parameter= --value= [--qualifier=<|=|>] [--reported=YYYY-MM-DD] --actor=',
  void: '<sample> --reason= --actor=',
  'raise-event': '--supply= --kind=health_exceedance|aesthetic_exceedance|treatment_failure|contamination|complaints|other --description= [--point=] [--parameter=] [--detected=YYYY-MM-DD] [--code=] --actor=',
  notify: '<event> --on=YYYY-MM-DD --by= --reference= --actor=',
  notice: '<event> --type=boil_water|do_not_drink|do_not_use [--on=YYYY-MM-DD] --actor=',
  resample: '<event> --sample= --actor=',
  'lift-notice': '<event> [--on=YYYY-MM-DD] --actor=',
  'close-event': '<event> --note= [--corrective-action=] [--on=YYYY-MM-DD] --actor=',
  'add-action': '--supply= --hazard= --action= --owner= --due=YYYY-MM-DD [--code=] --actor=',
  'complete-action': '<action code> --evidence= [--on=YYYY-MM-DD] --actor=',
  'review-plan': '<supply> [--on=YYYY-MM-DD] --actor=',
  register: '<supply> --reference= [--on=YYYY-MM-DD] --actor=',
  'log-complaint': '--supply= --kind=taste|odour|colour|pressure|illness|other --detail= [--location=] [--on=YYYY-MM-DD] [--code=] --actor=',
  'close-complaint': '<complaint code> --response= [--event=] [--on=YYYY-MM-DD] --actor=',
  import: 'wateroutlook [--results=results.csv] [--readings=readings.csv] [--dry-run] --actor=',
  export: '--out=<new-file.json>',
  'draft-notice': '<event>',
  'draft-notification': '<event>',
  'annual-report': '<supply> [--year=YYYY]',
  'weekly-review': '',
  help: '',
};

const mutating = new Set(['sample', 'result', 'void', 'raise-event', 'notify', 'notice', 'resample', 'lift-notice', 'close-event',
  'add-action', 'complete-action', 'review-plan', 'register', 'log-complaint', 'close-complaint', 'import']);
const EVENT_KINDS = ['health_exceedance', 'aesthetic_exceedance', 'treatment_failure', 'contamination', 'complaints', 'other'];
const NOTICES = ['boil_water', 'do_not_drink', 'do_not_use'];
const COMPLAINT_KINDS = ['taste', 'odour', 'colour', 'pressure', 'illness', 'other'];
const NOTIFIABLE = ['health_exceedance', 'contamination', 'treatment_failure'];
const TABLES = ['supplies', 'points', 'parameters', 'standards', 'schedules', 'samples', 'results', 'events', 'plan_actions',
  'complaints', 'daily_readings', 'imports', 'activity'];

const today = () => new Date().toISOString().slice(0, 10);
function need(v, label) {
  if (typeof v !== 'string' || !v.trim()) throw Error(`--${label} is required`);
  return v.trim();
}
function date(v, label, { past = false } = {}) {
  v = need(v, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) throw Error(`--${label} needs a real YYYY-MM-DD date`);
  if (past && v > today()) throw Error(`--${label} cannot be in the future`);
  return v;
}
function one(v, values, label) {
  if (!values.includes(v)) throw Error(`--${label} must be one of ${values.join(', ')}`);
  return v;
}
function num(v, label) {
  const n = Number(need(v, label));
  if (!Number.isFinite(n) || n < 0) throw Error(`--${label} must be a number, zero or more`);
  return n;
}

function parse(args) {
  const pos = [];
  const f = {};
  for (const arg of args) {
    if (!arg.startsWith('--')) { pos.push(arg); continue; }
    const [key, ...rest] = arg.slice(2).split('=');
    if (Object.hasOwn(f, key)) throw Error(`Duplicate flag --${key}`);
    f[key] = rest.length ? rest.join('=') : true;
  }
  const cmd = pos.shift() || 'help';
  if (!Object.hasOwn(usage, cmd)) throw Error(`Unknown command "${cmd}". Run: npm run water -- help`);
  const allowed = new Set(['json', ...[...usage[cmd].matchAll(/--([a-z-]+)/g)].map((m) => m[1])]);
  for (const k of Object.keys(f)) if (!allowed.has(k)) throw Error(`Unknown flag --${k} for ${cmd}. Usage: ${cmd} ${usage[cmd]}`);
  if (f.json !== undefined && f.json !== true) throw Error('--json is a boolean flag');
  if (Object.hasOwn(reads, cmd) && pos.length) throw Error(`Usage: ${cmd} takes no arguments`);
  return { cmd, pos, f };
}

async function log(db, actor, command, recordId, detail) {
  await db.query('insert into activity (actor, command, record_id, detail) values ($1,$2,$3,$4)', [actor, command, recordId, detail]);
}

// Match by code (case-insensitive, prefix) or by words in the name. Ambiguous -> list and fail.
async function findOne(db, table, q, label, nameCol = 'name') {
  q = need(q, label);
  const exact = await db.query(`select * from ${table} where lower(code) = lower($1)`, [q]);
  if (exact.length) return exact[0];
  const rows = await db.query(
    `select * from ${table} where lower(code) like lower($1) || '%' or lower(${nameCol}) like '%' || lower($1) || '%' order by code`, [q]);
  if (!rows.length) throw Error(`No matching ${label} for "${q}"`);
  if (rows.length > 1) throw Error(`Ambiguous: "${q}" matches ${rows.map((r) => `${r.code} (${truncate(r[nameCol], 40)})`).join('; ')}`);
  return rows[0];
}
const findSupply = (db, q) => findOne(db, 'supplies', q, 'supply');
const findPoint = (db, q) => findOne(db, 'points', q, 'point');
const findSample = (db, q) => findOne(db, 'samples', q, 'sample', 'code');
const findEvent = (db, q) => findOne(db, 'events', q, 'event', 'description');
async function nextCode(db, table, prefix, width) {
  const rows = await db.query(`select code from ${table} where code like $1`, [`${prefix}%`]);
  const n = rows.reduce((m, r) => Math.max(m, Number(r.code.slice(prefix.length)) || 0), 0) + 1;
  return prefix + String(n).padStart(width, '0');
}
async function findParameter(db, q) {
  const rows = await db.query('select * from parameters where lower(code) = lower($1) or lower(name) = lower($1)', [need(q, 'parameter')]);
  if (!rows.length) {
    const all = (await db.query('select code from parameters order by code')).map((r) => r.code);
    throw Error(`Unknown parameter "${q}". Known: ${all.join(', ')}`);
  }
  return rows[0];
}

// ------------------------------------------------------------------ commands

async function supplyDetail(db, q) {
  const s = await findSupply(db, q);
  return {
    supply: (await db.query(reads.supplies.sql.replace('where active', 'where active and id = $1'), [s.id]))[0] || s,
    points: await db.query('select code, name, kind from points where supply_id = $1 and active order by kind, code', [s.id]),
    due: await db.query('select point, parameter, every_days, last_sampled, next_due, days_overdue from sampling_due where supply = $1 order by next_due', [s.code]),
    attention: await db.query('select item, rule, detail, days from supply_attention where supply = $1 order by severity, days desc nulls last', [s.code]),
    events: await db.query(`select code, replace(kind, '_', ' ') as kind, detected_on, notified_on, replace(notice, '_', ' ') as notice, status from event_register where supply = $1 order by detected_on desc`, [s.code]),
  };
}

async function eventDetail(db, q) {
  const e = await findEvent(db, q);
  const reg = (await db.query('select * from event_register where code = $1', [e.code]))[0];
  return {
    event: { ...reg, corrective_action: e.corrective_action, closeout_note: e.closeout_note, notified_by: e.notified_by },
    trigger: e.result_id ? (await db.query(`select sample, sampled_on, point, parameter, case when qualifier = '=' then '' else qualifier end || value as result, unit, verdict from result_check where result_id = $1`, [e.result_id])) : [],
    resample: e.resample_id ? (await db.query(`select sample, sampled_on, parameter, case when qualifier = '=' then '' else qualifier end || value as result, unit, verdict from result_check where sample = (select code from samples where id = $1) order by parameter`, [e.resample_id])) : [],
    complaints: await db.query('select code, received_on, kind, location, detail from complaints where event_id = $1 order by received_on', [e.id]),
    activity: await db.query('select created_at, actor, command, detail from activity where record_id = $1 order by id', [e.code]),
  };
}

async function recordSample(db, f, actor) {
  const p = await findPoint(db, f.point);
  const on = date(f.on, 'on', { past: true });
  const code = f.code ? need(f.code, 'code').toUpperCase() : await nextCode(db, 'samples', 'S-', 5);
  const row = (await db.query(
    `insert into samples (code, point_id, sampled_on, sampled_by, lab, lab_ref) values ($1,$2,$3,$4,$5,$6) returning code, sampled_on, status`,
    [code, p.id, on, need(f.by, 'by'), f.lab || null, f['lab-ref'] || null]))[0];
  await log(db, actor, 'sample', code, `sampled at ${p.code} by ${f.by}`);
  return { ...row, point: p.code };
}

// Recording a result over a health limit opens an event in the same step,
// so a detection can never sit in the results table with nobody owning it.
async function recordResult(db, q, f, actor) {
  const s = await findSample(db, q);
  if (s.status === 'void') throw Error(`${s.code} was voided (${s.void_reason}); record the resample instead`);
  const pa = await findParameter(db, f.parameter);
  const qualifier = one(f.qualifier || '=', ['<', '=', '>'], 'qualifier');
  const value = num(f.value, 'value');
  const reported = f.reported ? date(f.reported, 'reported', { past: true }) : today();
  if (reported < s.sampled_on) throw Error(`--reported ${reported} is before the sample was taken (${s.sampled_on})`);
  const dup = await db.query('select 1 from results where sample_id = $1 and parameter = $2', [s.id, pa.code]);
  if (dup.length) throw Error(`${s.code} already has a ${pa.code} result. Results are never changed: void the sample and resample.`);
  await db.exec('BEGIN');
  try {
    const r = (await db.query('insert into results (sample_id, parameter, qualifier, value) values ($1,$2,$3,$4) returning id', [s.id, pa.code, qualifier, value]))[0];
    await db.query(`update samples set status = 'reported', reported_on = coalesce(reported_on, $2) where id = $1`, [s.id, reported]);
    const check = (await db.query('select * from result_check where result_id = $1', [r.id]))[0];
    let event = null;
    if (['over health limit', 'under health minimum'].includes(check.verdict)) {
      const p = (await db.query('select * from points where id = $1', [s.point_id]))[0];
      const code = await nextCode(db, 'events', 'EV-', 4);
      await db.query(`insert into events (code, supply_id, point_id, result_id, parameter, kind, detected_on, description, resample_due)
        values ($1,$2,$3,$4,$5,'health_exceedance',$6,$7,$8)`,
        [code, p.supply_id, p.id, r.id, pa.code, reported, `${pa.name} ${qualifier === '=' ? '' : qualifier}${value} ${pa.unit} at ${p.name} (sample ${s.code})`,
          pa.code === 'ECOLI' ? new Date(Date.parse(`${reported}T00:00:00Z`) + 86400000).toISOString().slice(0, 10) : null]);
      await log(db, actor, 'raise-event', code, `opened automatically from ${s.code} ${pa.code}`);
      event = code;
    }
    await log(db, actor, 'result', s.code, `${pa.code} ${qualifier}${value} ${pa.unit}: ${check.verdict}`);
    await db.exec('COMMIT');
    return {
      sample: s.code, parameter: pa.code, result: `${qualifier === '=' ? '' : qualifier}${value} ${pa.unit}`, verdict: check.verdict,
      ...(event ? { event_opened: event, next: `Tell ${check.country === 'NZ' ? 'Taumata Arowai' : 'the health regulator'} now (notify ${event}), resample, and decide on a notice to consumers.` } : {}),
    };
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
}

async function voidSample(db, q, f, actor) {
  const s = await findSample(db, q);
  if (s.status === 'void') throw Error(`${s.code} is already void`);
  const ev = await db.query('select e.code from events e join results r on r.id = e.result_id where r.sample_id = $1', [s.id]);
  if (ev.length) throw Error(`${s.code} triggered ${ev.map((e) => e.code).join(', ')}. A detection is never voided away: close the event with its reasons.`);
  await db.query(`update samples set status = 'void', void_reason = $2 where id = $1`, [s.id, need(f.reason, 'reason')]);
  await log(db, actor, 'void', s.code, f.reason);
  return { sample: s.code, status: 'void' };
}

async function raiseEvent(db, f, actor) {
  const su = await findSupply(db, f.supply);
  const p = f.point ? await findPoint(db, f.point) : null;
  if (p && p.supply_id !== su.id) throw Error(`${p.code} is not part of ${su.code}`);
  const pa = f.parameter ? await findParameter(db, f.parameter) : null;
  const code = f.code ? need(f.code, 'code').toUpperCase() : await nextCode(db, 'events', 'EV-', 4);
  const row = (await db.query(
    `insert into events (code, supply_id, point_id, parameter, kind, detected_on, description) values ($1,$2,$3,$4,$5,$6,$7)
     returning code, kind, detected_on, status`,
    [code, su.id, p?.id || null, pa?.code || null, one(f.kind, EVENT_KINDS, 'kind'), f.detected ? date(f.detected, 'detected', { past: true }) : today(),
      need(f.description, 'description')]))[0];
  await log(db, actor, 'raise-event', code, `${f.kind} at ${su.code}`);
  return { ...row, supply: su.code, notify_regulator: NOTIFIABLE.includes(f.kind) ? `yes: ${su.regulator}` : 'not by this kind' };
}

async function notify(db, q, f, actor) {
  const e = await findEvent(db, q);
  if (e.notified_on) throw Error(`${e.code} was notified on ${e.notified_on} (${e.regulator_ref})`);
  const on = date(f.on, 'on', { past: true });
  if (on < e.detected_on) throw Error(`--on ${on} is before the event was detected (${e.detected_on})`);
  await db.query('update events set notified_on = $2, notified_by = $3, regulator_ref = $4 where id = $1', [e.id, on, need(f.by, 'by'), need(f.reference, 'reference')]);
  const days = (Date.parse(on) - Date.parse(e.detected_on)) / 86400000;
  const within = (await db.query('select notify_within_days from supplies where id = $1', [e.supply_id]))[0].notify_within_days;
  await log(db, actor, 'notify', e.code, `regulator told ${on} by ${f.by}, ref ${f.reference}`);
  return { event: e.code, notified_on: on, reference: f.reference, days_after_detection: days, late: days > within };
}

async function notice(db, q, f, actor) {
  const e = await findEvent(db, q);
  if (e.status !== 'open') throw Error(`${e.code} is closed`);
  if (e.notice !== 'none' && !e.notice_lifted_on) throw Error(`${e.code} already has a ${e.notice.replace(/_/g, ' ')} notice in force since ${e.notice_on}`);
  const on = f.on ? date(f.on, 'on', { past: true }) : today();
  await db.query('update events set notice = $2, notice_on = $3, notice_lifted_on = null where id = $1', [e.id, one(f.type, NOTICES, 'type'), on]);
  await log(db, actor, 'notice', e.code, `${f.type.replace(/_/g, ' ')} notice issued ${on}`);
  return { event: e.code, notice: f.type, notice_on: on, next: `Draft the consumer notice: npm run water -- draft-notice ${e.code}` };
}

async function linkResample(db, q, f, actor) {
  const e = await findEvent(db, q);
  const s = await findSample(db, f.sample);
  if (s.status === 'void') throw Error(`${s.code} is void`);
  if (e.point_id) {
    const p = (await db.query('select supply_id from points where id = $1', [s.point_id]))[0];
    if (p.supply_id !== e.supply_id) throw Error(`${s.code} is from another supply`);
  }
  const trigger = e.result_id ? (await db.query('select s.sampled_on from results r join samples s on s.id = r.sample_id where r.id = $1', [e.result_id]))[0] : null;
  if (trigger && s.sampled_on <= trigger.sampled_on) throw Error(`${s.code} was taken ${s.sampled_on}, not after the sample that triggered ${e.code}`);
  await db.query('update events set resample_id = $2 where id = $1', [e.id, s.id]);
  await log(db, actor, 'resample', e.code, `resample ${s.code} linked`);
  const res = await db.query(`select parameter, verdict from result_check where sample = $1`, [s.code]);
  return { event: e.code, resample: s.code, results: res.length ? res.map((r) => `${r.parameter}: ${r.verdict}`).join(', ') : 'not back from the lab yet' };
}

async function clearResample(db, e) {
  if (!e.resample_id) return 'no resample is linked (run resample)';
  const s = (await db.query('select * from samples where id = $1', [e.resample_id]))[0];
  if (e.notice_on && s.sampled_on < e.notice_on) return `the resample ${s.code} was taken before the notice went out`;
  const rows = await db.query('select parameter, verdict from result_check where sample = $1', [s.code]);
  if (!rows.length) return `the resample ${s.code} has no results yet`;
  const bad = rows.filter((r) => r.verdict !== 'ok' && r.verdict !== 'over aesthetic value');
  if (bad.length) return `the resample ${s.code} is not clear: ${bad.map((r) => `${r.parameter} ${r.verdict}`).join(', ')}`;
  if (e.parameter && !rows.some((r) => r.parameter === e.parameter)) return `the resample ${s.code} has no ${e.parameter} result`;
  return null;
}

async function liftNotice(db, q, f, actor) {
  const e = await findEvent(db, q);
  if (e.notice === 'none' || e.notice_lifted_on) throw Error(`${e.code} has no notice in force`);
  const blocker = await clearResample(db, e);
  if (blocker) throw Error(`${e.code} notice cannot be lifted: ${blocker}`);
  const on = f.on ? date(f.on, 'on', { past: true }) : today();
  if (on < e.notice_on) throw Error(`--on ${on} is before the notice was issued (${e.notice_on})`);
  await db.query('update events set notice_lifted_on = $2 where id = $1', [e.id, on]);
  await log(db, actor, 'lift-notice', e.code, `${e.notice.replace(/_/g, ' ')} notice lifted ${on}`);
  return { event: e.code, notice_lifted_on: on, days_in_force: (Date.parse(on) - Date.parse(e.notice_on)) / 86400000 };
}

async function closeEvent(db, q, f, actor) {
  const e = await findEvent(db, q);
  if (e.status === 'closed') throw Error(`${e.code} was closed on ${e.closed_on}`);
  const blockers = [];
  if (NOTIFIABLE.includes(e.kind) && !e.notified_on) blockers.push('the regulator has not been told (run notify)');
  if (e.notice !== 'none' && !e.notice_lifted_on) blockers.push(`the ${e.notice.replace(/_/g, ' ')} notice is still in force`);
  if (e.kind === 'health_exceedance' && e.parameter === 'ECOLI') { const b = await clearResample(db, e); if (b) blockers.push(b); }
  const action = f['corrective-action'] || e.corrective_action;
  if (!action) blockers.push('no corrective action recorded (pass --corrective-action)');
  if (blockers.length) throw Error(`${e.code} cannot close: ${blockers.join('; ')}`);
  const on = f.on ? date(f.on, 'on', { past: true }) : today();
  await db.query(`update events set status = 'closed', closed_on = $2, closeout_note = $3, corrective_action = $4 where id = $1`, [e.id, on, need(f.note, 'note'), action]);
  await log(db, actor, 'close-event', e.code, f.note);
  return { event: e.code, status: 'closed', closed_on: on };
}

async function addAction(db, f, actor) {
  const su = await findSupply(db, f.supply);
  const code = f.code ? need(f.code, 'code').toUpperCase() : await nextCode(db, 'plan_actions', 'PA-', 3);
  const row = (await db.query(
    `insert into plan_actions (code, supply_id, hazard, action, owner, due) values ($1,$2,$3,$4,$5,$6) returning code, owner, due`,
    [code, su.id, need(f.hazard, 'hazard'), need(f.action, 'action'), need(f.owner, 'owner'), date(f.due, 'due')]))[0];
  await log(db, actor, 'add-action', code, `${su.code}: ${f.action}`);
  return { supply: su.code, ...row };
}

async function completeAction(db, q, f, actor) {
  const rows = await db.query('select * from plan_actions where lower(code) = lower($1)', [need(q, 'action')]);
  if (!rows.length) throw Error(`No matching plan action "${q}"`);
  const a = rows[0];
  if (a.done_on) throw Error(`${a.code} was completed on ${a.done_on}`);
  const on = f.on ? date(f.on, 'on', { past: true }) : today();
  await db.query('update plan_actions set done_on = $2, evidence = $3 where id = $1', [a.id, on, need(f.evidence, 'evidence')]);
  await log(db, actor, 'complete-action', a.code, f.evidence);
  return { action: a.code, done_on: on };
}

async function reviewPlan(db, q, f, actor) {
  const su = await findSupply(db, q);
  const on = f.on ? date(f.on, 'on', { past: true }) : today();
  await db.query('update supplies set plan_reviewed_on = $2 where id = $1', [su.id, on]);
  await log(db, actor, 'review-plan', su.code, `safety plan reviewed ${on}`);
  return { supply: su.code, plan_reviewed_on: on };
}

async function register(db, q, f, actor) {
  const su = await findSupply(db, q);
  const on = f.on ? date(f.on, 'on', { past: true }) : today();
  await db.query('update supplies set registration_ref = $2, registered_on = $3 where id = $1', [su.id, need(f.reference, 'reference'), on]);
  await log(db, actor, 'register', su.code, `registered with ${su.regulator}, ref ${f.reference}`);
  return { supply: su.code, registration_ref: f.reference, registered_on: on };
}

async function logComplaint(db, f, actor) {
  const su = await findSupply(db, f.supply);
  const code = f.code ? need(f.code, 'code').toUpperCase() : await nextCode(db, 'complaints', 'C-', 3);
  const kind = one(f.kind, COMPLAINT_KINDS, 'kind');
  const row = (await db.query(
    `insert into complaints (code, supply_id, received_on, kind, location, detail) values ($1,$2,$3,$4,$5,$6) returning code, received_on, kind`,
    [code, su.id, f.on ? date(f.on, 'on', { past: true }) : today(), kind, f.location || null, need(f.detail, 'detail')]))[0];
  await log(db, actor, 'log-complaint', code, `${kind} at ${su.code}`);
  return { supply: su.code, ...row, ...(kind === 'illness' ? { next: 'An illness complaint: check recent results at that part of the network and consider raising an event.' } : {}) };
}

async function closeComplaint(db, q, f, actor) {
  const rows = await db.query('select * from complaints where lower(code) = lower($1)', [need(q, 'complaint')]);
  if (!rows.length) throw Error(`No matching complaint "${q}"`);
  const c = rows[0];
  if (c.closed_on) throw Error(`${c.code} was closed on ${c.closed_on}`);
  const ev = f.event ? await findEvent(db, f.event) : null;
  const on = f.on ? date(f.on, 'on', { past: true }) : today();
  await db.query('update complaints set response = $2, closed_on = $3, event_id = coalesce($4, event_id) where id = $1', [c.id, need(f.response, 'response'), on, ev?.id || null]);
  await log(db, actor, 'close-complaint', c.code, f.response);
  return { complaint: c.code, closed_on: on, event: ev?.code || null };
}

// ------------------------------------------------------------------ import / export

// WaterOutlook data exports are set up per client, and labs send their own
// layouts, so column names vary. These are the names we accept; anything else is
// reported, never guessed.
const RCOLS = {
  point: ['Sample Point', 'Sampling Point', 'Site', 'Location', 'Monitoring Point', 'Point'],
  sampled_on: ['Date Sampled', 'Sample Date', 'Sampled', 'Date', 'Collection Date'],
  parameter: ['Parameter', 'Determinand', 'Analyte', 'Test', 'Measurement'],
  result: ['Result', 'Value', 'Reading', 'Result Value'],
  unit: ['Units', 'Unit'],
  lab: ['Laboratory', 'Lab'],
  lab_ref: ['Lab Reference', 'Lab Ref', 'Lab Sample ID', 'Sample ID', 'Lab Number'],
  sampled_by: ['Sampled By', 'Sampler', 'Collected By'],
  reported_on: ['Date Reported', 'Reported', 'Report Date', 'Result Date'],
};
const DCOLS = {
  point: RCOLS.point,
  reading_on: ['Date', 'Day', 'Reading Date'],
  parameter: RCOLS.parameter,
  min: ['Min', 'Minimum', 'Daily Min'],
  max: ['Max', 'Maximum', 'Daily Max'],
  minutes_out: ['Minutes Out', 'Minutes Out Of Limit', 'Time Out Of Spec (min)', 'Exceedance Minutes'],
};
const PARAM_WORDS = { ECOLI: ['e. coli', 'e.coli', 'ecoli', 'escherichia'], COLIFORMS: ['total coliform', 'coliforms'],
  FAC: ['free available chlorine', 'free chlorine', 'fac'], TURBIDITY: ['turbidity'], PH: ['ph'], NITRATE: ['nitrate'],
  ARSENIC: ['arsenic'], LEAD: ['lead'], MANGANESE: ['manganese'], FLUORIDE: ['fluoride'] };
function mapParameter(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return undefined;
  for (const [code, words] of Object.entries(PARAM_WORDS)) if (s === code.toLowerCase() || words.some((w) => s === w || s.startsWith(w + ' ') || s.startsWith(w + ' ('))) return code;
  return undefined;
}
function normDate(v, label) {
  v = String(v || '').trim();
  if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return date(`${m[1]}-${m[2]}-${m[3]}`, label);
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // NZ and AU exports: day first
  if (m) return date(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`, label);
  throw Error(`${label}: "${v}" is not a date this importer reads (use YYYY-MM-DD or DD/MM/YYYY)`);
}
function parseResult(v) {
  const m = String(v || '').trim().match(/^([<>]=?|=)?\s*(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return { qualifier: m[1] ? m[1][0] : '=', value: Number(m[2]) };
}
const UNIT_OK = { ECOLI: ['mpn/100 ml', 'cfu/100 ml', 'mpn/100ml', 'cfu/100ml', '/100 ml', '/100ml'], COLIFORMS: ['mpn/100 ml', 'cfu/100 ml', 'mpn/100ml', 'cfu/100ml', '/100 ml', '/100ml'],
  TURBIDITY: ['ntu'], PH: ['ph', 'ph units', ''] };

async function importWaterOutlook(db, f, actor) {
  if (!f.results && !f.readings) throw Error('Pass --results=<lab results csv> and/or --readings=<daily readings csv>');
  const points = await db.query('select id, code, name from points');
  const findPt = (name) => points.find((p) => p.code.toLowerCase() === name.toLowerCase() || p.name.toLowerCase() === name.toLowerCase());
  const params = new Map((await db.query('select code, unit from parameters')).map((r) => [r.code, r.unit]));
  const problems = [];
  const samples = new Map(); // key point|date|labref -> { ..., results: [] }
  let rRows = [];
  let rText = '';
  if (f.results) {
    rText = fs.readFileSync(need(f.results, 'results'), 'utf8');
    rRows = parseCsv(rText);
    rRows.forEach((r, i) => {
      const line = i + 2;
      try {
        const g = (k) => pick(r, ...RCOLS[k]).trim();
        const pt = findPt(need(g('point'), `row ${line} sample point`));
        if (!pt) throw Error(`sample point "${g('point')}" is not set up here; add it first`);
        const parameter = mapParameter(g('parameter'));
        if (!parameter) throw Error(`parameter "${g('parameter')}" has no mapping`);
        const res = parseResult(g('result'));
        if (!res) throw Error(`result "${g('result')}" is not a number this importer reads (e.g. 0.35, <1, >200)`);
        const unit = g('unit').toLowerCase();
        if (unit && UNIT_OK[parameter] && !UNIT_OK[parameter].includes(unit)) throw Error(`${parameter} in "${g('unit')}"; expected ${params.get(parameter)}`);
        if (unit && !UNIT_OK[parameter] && unit !== params.get(parameter).toLowerCase()) throw Error(`${parameter} in "${g('unit')}"; expected ${params.get(parameter)} (convert before import)`);
        const sampled = need(normDate(g('sampled_on'), `row ${line} date sampled`) || '', `row ${line} date sampled`);
        const key = `${pt.code}|${sampled}|${g('lab_ref')}`;
        if (!samples.has(key)) samples.set(key, { point: pt, sampled, lab: g('lab') || null, lab_ref: g('lab_ref') || null, by: g('sampled_by') || 'unknown (imported)',
          reported: normDate(g('reported_on'), `row ${line} date reported`) || sampled, results: [] });
        const smp = samples.get(key);
        if (smp.results.some((x) => x.parameter === parameter)) throw Error(`${parameter} appears twice for ${pt.code} on ${sampled}`);
        smp.results.push({ parameter, ...res });
      } catch (e) { problems.push(`results row ${line}: ${e.message}`); }
    });
  }
  const readings = [];
  let dRows = [];
  let dText = '';
  if (f.readings) {
    dText = fs.readFileSync(need(f.readings, 'readings'), 'utf8');
    dRows = parseCsv(dText);
    dRows.forEach((r, i) => {
      const line = i + 2;
      try {
        const g = (k) => pick(r, ...DCOLS[k]).trim();
        const pt = findPt(need(g('point'), `readings row ${line} point`));
        if (!pt) throw Error(`point "${g('point')}" is not set up here; add it first`);
        const parameter = mapParameter(g('parameter'));
        if (!parameter) throw Error(`parameter "${g('parameter')}" has no mapping`);
        const n = (v) => (v === '' ? null : Number(v));
        const min = n(g('min')); const max = n(g('max')); const out = n(g('minutes_out')) ?? 0;
        if ([min, max, out].some((v) => v !== null && !Number.isFinite(v))) throw Error('min, max and minutes out must be numbers');
        readings.push({ point: pt, day: need(normDate(g('reading_on'), `readings row ${line} date`) || '', `readings row ${line} date`), parameter, min, max, out });
      } catch (e) { problems.push(`readings row ${line}: ${e.message}`); }
    });
  }
  // A sample already here (same point, date and lab reference) is skipped, not doubled.
  const existing = new Set((await db.query(`select p.code || '|' || s.sampled_on || '|' || coalesce(s.lab_ref, '') as k from samples s join points p on p.id = s.point_id`)).map((r) => r.k));
  const fresh = [...samples.entries()].filter(([k]) => !existing.has(k)).map(([, v]) => v);
  const summary = { results_rows: rRows.length, samples_new: fresh.length, samples_already_here: samples.size - fresh.length,
    results_new: fresh.reduce((n, s) => n + s.results.length, 0), readings_rows: dRows.length, problems, dry_run: Boolean(f['dry-run']) };
  if (problems.length || f['dry-run']) {
    if (problems.length && !f['dry-run']) throw Error(`Nothing imported. Fix these first:\n  ${problems.join('\n  ')}`);
    return summary;
  }
  await db.exec('BEGIN');
  try {
    let opened = [];
    for (const s of fresh) {
      const code = await nextCode(db, 'samples', 'S-', 5);
      const row = (await db.query(`insert into samples (code, point_id, sampled_on, sampled_by, lab, lab_ref, status, reported_on, source)
        values ($1,$2,$3,$4,$5,$6,'reported',$7,'wateroutlook') returning id`, [code, s.point.id, s.sampled, s.by, s.lab, s.lab_ref, s.reported < s.sampled ? s.sampled : s.reported]))[0];
      for (const r of s.results) {
        const res = (await db.query('insert into results (sample_id, parameter, qualifier, value) values ($1,$2,$3,$4) returning id', [row.id, r.parameter, r.qualifier, r.value]))[0];
        const chk = (await db.query('select verdict from result_check where result_id = $1', [res.id]))[0];
        if (['over health limit', 'under health minimum'].includes(chk.verdict)) opened.push(`${code} ${r.parameter}`);
      }
    }
    let readingsIn = 0;
    for (const d of readings) {
      const ins = await db.query(`insert into daily_readings (point_id, reading_on, parameter, min_value, max_value, minutes_out) values ($1,$2,$3,$4,$5,$6)
        on conflict (point_id, reading_on, parameter) do nothing returning id`, [d.point.id, d.day, d.parameter, d.min, d.max, d.out]);
      readingsIn += ins.length;
    }
    for (const [file, text, rows, n] of [[f.results, rText, rRows, fresh.length], [f.readings, dText, dRows, readingsIn]]) {
      if (!file) continue;
      await db.query('insert into imports (source, file_name, file_sha256, rows_read, rows_imported, actor) values ($1,$2,$3,$4,$5,$6)',
        ['wateroutlook', path.basename(file), createHash('sha256').update(text).digest('hex'), rows.length, n, actor]);
    }
    await log(db, actor, 'import', null, `wateroutlook: ${fresh.length} samples, ${summary.results_new} results, ${readingsIn} daily readings`);
    await db.exec('COMMIT');
    // Imported history is not auto-raised as events: past detections may already be handled
    // in the old system. They are listed here and in attention until someone raises or reviews them.
    return { ...summary, readings_new: readingsIn, health_results_to_review: opened };
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
}

async function exportAll(db, f) {
  const out = path.resolve(need(f.out, 'out'));
  if (fs.existsSync(out)) throw Error(`${out} already exists; choose a new file name`);
  const data = { exported_at: new Date().toISOString() };
  for (const t of TABLES) data[t] = await db.query(`select * from ${t}`);
  fs.writeFileSync(out, JSON.stringify(data, null, 2), { mode: 0o600 });
  return { file: out, tables: Object.fromEntries(TABLES.map((t) => [t, data[t].length])) };
}

// ------------------------------------------------------------------ drafts

function draftsDir() {
  const dir = path.join(process.env.OUTPUT_DIR || REPO_ROOT, 'drafts');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
const md = (rows) => {
  if (!rows.length) return '_None._\n';
  const cols = Object.keys(rows[0]);
  const cell = (v) => String(v ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ');
  return `| ${cols.join(' | ')} |\n|${cols.map(() => '---').join('|')}|\n${rows.map((r) => `| ${cols.map((c) => cell(r[c])).join(' | ')} |`).join('\n')}\n`;
};

async function draftNotice(db, q) {
  const d = await eventDetail(db, q);
  const e = d.event;
  if (e.notice === 'none') throw Error(`${e.code} has no notice. Record one first: npm run water -- notice ${e.code} --type=boil_water`);
  const su = (await db.query('select * from supplies where code = $1', [e.supply]))[0];
  const what = { boil_water: 'Boil water notice', do_not_drink: 'Do not drink notice', do_not_use: 'Do not use notice' }[e.notice];
  const advice = {
    boil_water: 'Bring all water used for drinking, preparing food, brushing teeth, making ice and preparing baby formula to a rolling boil, then let it cool. Water for showering and washing clothes does not need to be boiled.',
    do_not_drink: 'Do not drink the tap water or use it for preparing food, brushing teeth, making ice or baby formula. Use bottled water or water from the tanker points listed below. Boiling does not make this water safe to drink.',
    do_not_use: 'Do not use the tap water for anything, including washing, until further notice. Use bottled water or water from the tanker points listed below.',
  }[e.notice];
  const body = `# ${what}: ${su.name}

**Issued ${e.notice_on} by ${su.operator}**

## Who this affects
Everyone who gets water from ${su.name}${e.point ? ` (the area served from ${e.point})` : ''}.

## What to do
${advice}

## Why
${e.description}. We are working to fix this and are testing the water again.

## What we are doing
${e.corrective_action || '[Write what is being done: flushing, chlorine dose, repair.]'}

## When this will end
We will tell you when the water is safe again. This notice stays in place until test results show the water is clear.

## Questions
[Phone number, website, where to collect water if needed.]

_Draft prepared ${today()} from event ${e.code}. Check every line, add contact details and the area map, then publish it through your usual channels. Nothing has been sent._
`;
  const file = path.join(draftsDir(), `notice-${e.code.toLowerCase()}-${today()}.md`);
  fs.writeFileSync(file, body);
  return { file, event: e.code };
}

async function draftNotification(db, q) {
  const d = await eventDetail(db, q);
  const e = d.event;
  const su = (await db.query('select * from supplies where code = $1', [e.supply]))[0];
  const body = `# Notification to ${su.regulator}: ${e.code}

| Field | Value |
|---|---|
| Supply | ${su.name} (${su.registration_ref || 'registration not recorded'}) |
| People served | ${su.population} |
| Event | ${e.kind.replace(/_/g, ' ')}${e.parameter ? `, ${e.parameter}` : ''} |
| Where | ${e.point || 'whole supply'} |
| Detected | ${e.detected_on} |
| Notice to consumers | ${e.notice === 'none' ? 'none issued' : `${e.notice.replace(/_/g, ' ')} from ${e.notice_on}`} |

## What happened
${e.description}

## Triggering result
${md(d.trigger)}
## Resample
${d.resample.length ? md(d.resample) : 'Not yet taken or not yet back from the lab.\n'}
## What we have done and will do
${e.corrective_action || '[Immediate actions: isolation, flushing, chlorine, repair, notice.]'}

## Contact
${su.operator}. [Name, phone.]

_Draft prepared ${today()} from the event record. Check it, then lodge it the way your regulator asks. Record the reference with: npm run water -- notify ${e.code} --on=<date> --by=<name> --reference=<ref>_
`;
  const file = path.join(draftsDir(), `notification-${e.code.toLowerCase()}-${today()}.md`);
  fs.writeFileSync(file, body);
  return { file, event: e.code, regulator: su.regulator };
}

async function annualReport(db, q, f) {
  const su = await findSupply(db, q);
  const year = f.year ? Number(f.year) : new Date().getUTCFullYear() - 1;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw Error('--year must be a four-digit year');
  // New Zealand reports by calendar year (DWQAR 2022 G4); Victoria by financial year ending 30 June (Safe Drinking Water Act 2003 s 26).
  const from = su.country === 'AU' ? `${year - 1}-07-01` : `${year}-01-01`;
  const to = su.country === 'AU' ? `${year}-06-30` : `${year}-12-31`;
  const tests = await db.query(`select parameter, count(*)::int as results, count(*) filter (where verdict = 'ok')::int as ok,
      count(*) filter (where verdict in ('over health limit','under health minimum'))::int as health, count(*) filter (where verdict like '%operational%')::int as operational,
      count(*) filter (where verdict = 'over aesthetic value')::int as aesthetic
    from result_check where supply = $1 and sampled_on between $2 and $3 group by parameter order by parameter`, [su.code, from, to]);
  const events = await db.query(`select code, replace(kind, '_', ' ') as kind, parameter, detected_on, notified_on, replace(notice, '_', ' ') as notice, notice_on, notice_lifted_on, status
    from event_register where supply = $1 and detected_on between $2 and $3 order by detected_on`, [su.code, from, to]);
  const complaints = await db.query(`select kind, count(*)::int as complaints from complaints where supply_id = $1 and received_on between $2 and $3 group by kind order by kind`, [su.id, from, to]);
  const missed = await db.query('select point, parameter, every_days, days_overdue from sampling_due where supply = $1 and days_overdue > 0', [su.code]);
  const body = `# Annual drinking water report ${year}: ${su.name}

| Field | Value |
|---|---|
| Supplier | ${su.operator} |
| Registration | ${su.registration_ref || 'not recorded'} with ${su.regulator} |
| People served | ${su.population} |
| Safety plan last reviewed | ${su.plan_reviewed_on || 'not recorded'} |

## Results by parameter
${md(tests)}
## Events
${md(events)}
## Complaints
${md(complaints)}
## Sampling overdue today
${md(missed)}
_Draft prepared ${today()} from the records for ${from} to ${to}. Your regulator sets the form and the deadline (see docs/compliance.md); check both before you lodge it._
`;
  const file = path.join(draftsDir(), `annual-report-${su.code.toLowerCase()}-${year}.md`);
  fs.writeFileSync(file, body);
  return { file, supply: su.code, year, results: tests.reduce((n, t) => n + t.results, 0), events: events.length };
}

async function weeklyReview(db) {
  const att = await db.query(reads.attention.sql);
  const due = await db.query(reads.due.sql);
  const ev = await db.query(`select code, supply, replace(kind, '_', ' ') as kind, parameter, detected_on, notified_on, replace(notice, '_', ' ') as notice, days_open
    from event_register where status = 'open' order by detected_on`);
  const urgent = (await db.query('select supply, item, rule from supply_attention where severity = 1 order by supply, item'));
  const body = `# Drinking water: weekly review, ${today()}

${urgent.length ? `**${urgent.length} item(s) touch public health or a legal duty and come first:** ${urgent.map((u) => `${u.item} at ${u.supply} (${u.rule})`).join('; ')}.` : '**Nothing this week touches public health or a legal duty.**'}

## Needs attention
${md(att)}
## Open events
${md(ev)}
## Sampling run for the next 7 days
${md(due)}
_Draft from three commands: attention, events, due. Read before it goes to the operations meeting._
`;
  const file = path.join(draftsDir(), `weekly-review-${today()}.md`);
  fs.writeFileSync(file, body);
  return { file, needs_attention: att.length, urgent: urgent.length, open_events: ev.length, samples_due: due.length };
}

// ------------------------------------------------------------------ run

export async function run(db, args) {
  const { cmd, pos, f } = parse(args);
  let actor = null;
  if (mutating.has(cmd)) actor = need(f.actor, 'actor');
  if (Object.hasOwn(reads, cmd)) {
    if (cmd === 'compliance') {
      const out = [];
      for (const r of complianceRules) for (const row of await db.query(r.sql)) out.push({ rule: r.rule, code: row.code, finding: row.finding });
      return out.sort((a, b) => a.code.localeCompare(b.code) || a.rule.localeCompare(b.rule));
    }
    return db.query(reads[cmd].sql);
  }
  const target = pos[0];
  switch (cmd) {
    case 'help': return Object.entries(usage).map(([command, a]) => ({ command, args: a, about: reads[command]?.about || '' }));
    case 'supply': return supplyDetail(db, pos.join(' '));
    case 'event': return eventDetail(db, pos.join(' '));
    case 'sample': return recordSample(db, f, actor);
    case 'result': return recordResult(db, target, f, actor);
    case 'void': return voidSample(db, target, f, actor);
    case 'raise-event': return raiseEvent(db, f, actor);
    case 'notify': return notify(db, target, f, actor);
    case 'notice': return notice(db, target, f, actor);
    case 'resample': return linkResample(db, target, f, actor);
    case 'lift-notice': return liftNotice(db, target, f, actor);
    case 'close-event': return closeEvent(db, target, f, actor);
    case 'add-action': return addAction(db, f, actor);
    case 'complete-action': return completeAction(db, target, f, actor);
    case 'review-plan': return reviewPlan(db, pos.join(' '), f, actor);
    case 'register': return register(db, target, f, actor);
    case 'log-complaint': return logComplaint(db, f, actor);
    case 'close-complaint': return closeComplaint(db, target, f, actor);
    case 'import':
      if (target !== 'wateroutlook') throw Error(`Usage: import ${usage.import}`);
      return importWaterOutlook(db, f, actor);
    case 'export': return exportAll(db, f);
    case 'draft-notice': return draftNotice(db, pos.join(' '));
    case 'draft-notification': return draftNotification(db, pos.join(' '));
    case 'annual-report': return annualReport(db, pos.join(' '), f);
    case 'weekly-review': return weeklyReview(db);
    default: throw Error(`Unknown command ${cmd}`);
  }
}

function print(cmd, result) {
  if (Array.isArray(result)) {
    if (!result.length) { console.log('  (none)'); return; }
    const cols = Object.keys(result[0]).map((key) => ({ key, label: key, width: ['detail', 'description', 'finding', 'about', 'args', 'action', 'hazard'].includes(key) ? 48 : undefined,
      align: typeof result[0][key] === 'number' ? 'right' : 'left' }));
    console.log(textTable(result, cols));
    return;
  }
  if (cmd === 'event' || cmd === 'supply') {
    const head = result.event || result.supply;
    console.log(heading(`${head.code}  ${head.description || head.name || ''}`));
    for (const [k, v] of Object.entries(head)) if (v !== null && v !== undefined && !['code', 'description', 'name'].includes(k)) console.log(`  ${k.padEnd(22)}${v}`);
    for (const [label, rows] of Object.entries(result)) {
      if (!Array.isArray(rows)) continue;
      console.log(heading(label));
      print('', rows);
    }
    return;
  }
  for (const [k, v] of Object.entries(result)) console.log(`  ${k.padEnd(26)}${Array.isArray(v) ? (v.length ? '\n    ' + v.join('\n    ') : 'none') : typeof v === 'object' && v ? JSON.stringify(v) : v}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  let db;
  try {
    db = await getDb();
    const result = await run(db, args);
    if (args.includes('--json')) console.log(JSON.stringify(result, null, 2));
    else print(args.find((a) => !a.startsWith('--')) || 'help', result);
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    if (db) await db.close();
  }
}
