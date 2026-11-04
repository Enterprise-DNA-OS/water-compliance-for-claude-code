// npm test: a temporary database, migrate, seed twice, then every command and every gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { migrate } from './migrate.mjs';
import { seed } from './seed.mjs';
import { run, reads, usage } from './water.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'water-'));
process.env.DATA_DIR = path.join(tmp, 'db');
process.env.OUTPUT_DIR = tmp;
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || '';
const db = await getDb();
const exercised = new Set();
let checks = 0;
const ok = (v, msg) => { assert.ok(v, msg); checks++; };
const call = async (args) => { exercised.add(args[0]); return run(db, args); };
const fail = async (args, re) => { exercised.add(args[0]); await assert.rejects(() => run(db, args), re); checks++; };
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const actor = '--actor=Tester';

try {
  ok((await migrate(db)).ran.length === 1, 'migration applies');
  ok((await migrate(db)).ran.length === 0, 'migration is idempotent');
  await seed(db);
  await seed(db);
  ok((await db.query('select * from samples')).length === 70, 'seed is idempotent');

  // Every read works in both shapes.
  for (const name of Object.keys(reads)) ok(Array.isArray(await call([name, '--json'])), `${name} returns rows`);
  ok((await call(['help'])).length === Object.keys(usage).length, 'help lists every command');

  // The attention list finds what the seed planted.
  const att = await call(['attention']);
  const has = (item, rule) => att.some((r) => r.item === item && r.rule === rule);
  ok(has('S-KHS-TAP-M2 ECOLI', 'health result with no event'));
  ok(has('EV-0003', 'regulator not notified'));
  ok(has('EV-0003', 'resample overdue'));
  ok(has('EV-0002', 'notice in force'));
  ok(has('RVW-Z1 ECOLI', 'sampling overdue'));
  ok(has('S-TWS-Z1-PB', 'lab result overdue'));
  ok(has('RVW-WTP TURBIDITY', 'treatment out of limit'));
  ok(has('TWS', 'safety plan review overdue'));
  ok(has('PA-001', 'plan action overdue'));
  ok(has('C-001', 'complaint open'));
  ok(has('EV-0004', 'event not closed'));
  ok(has('KHS', 'not registered'));
  ok(!att.some((r) => r.item === 'EV-0001'), 'a closed, clean event needs nothing');
  ok(!att.some((r) => r.item === 'C-002'), 'a closed complaint needs nothing');
  const comp = await call(['compliance']);
  const finds = (rule, code) => comp.some((r) => r.rule === rule && r.code === code);
  ok(finds('EVENT-FOR-DETECTION', 'S-KHS-TAP-M2'));
  ok(finds('NOTIFY-REGULATOR', 'EV-0003'));
  ok(finds('RESAMPLE', 'EV-0003'));
  ok(finds('SAMPLING-FREQUENCY', 'RVW-Z1 ECOLI'));
  ok(finds('SAFETY-PLAN', 'TWS') && finds('SAFETY-PLAN', 'KHS'));
  ok(finds('REGISTRATION', 'KHS'));
  ok(finds('SAMPLING-GAP', 'RVW-Z1'), 'more than 9 days between E. coli samples in a large network');
  ok(!finds('SAMPLING-GAP', 'BLV-Z1'), 'the 9-day rule is New Zealand only');
  ok(!finds('NOTIFY-REGULATOR', 'EV-0004'), 'notified within the supply window');
  ok(!finds('RESAMPLE', 'EV-0002'), 'a clear resample satisfies the rule');
  ok(!comp.some((r) => r.code === 'EV-0001'), 'the closed event is clean');
  const ex = await call(['exceedances']);
  ok(ex.some((r) => r.sample === 'S-BLV-Z1-MN1' && r.verdict === 'over aesthetic value'), 'Australian aesthetic value applies to an AU supply');
  ok(ex.some((r) => r.sample === 'S-TWS-Z1-E1' && r.parameter === 'FAC' && r.verdict === 'under operational minimum'));
  ok(!(await call(['results'])).some((r) => r.parameter === 'ECOLI' && r.result === '<1' && r.verdict !== 'ok'), 'a non-detect is never an exceedance');
  ok((await call(['stats'])).find((r) => r.supply === 'RVW').detections === 1);
  ok((await call(['lab'])).find((r) => r.lab === 'Hill Laboratories').waiting === 1);

  // Lookup: code, prefix, name words, ambiguity, misses, bad flags.
  ok((await call(['supply', 'kahu'])).supply.code === 'KHS');
  ok((await call(['event', 'ev-0002'])).event.notice === 'boil_water');
  await fail(['supply', 'water'], /Ambiguous/);
  await fail(['supply', 'nothing like this'], /No matching/);
  await fail(['attention', '--wat'], /Unknown flag/);
  await fail(['attention', 'extra'], /takes no arguments/);
  await fail(['attention', '--json=no'], /boolean/);
  await fail(['sample', '--point=RVW-Z1', `--on=${day(0)}`, '--by=x'], /--actor is required/);

  // A routine sample, then a detection from start to close, every gate tried on the way.
  await fail(['sample', '--point=RVW-Z1', `--on=${day(2)}`, '--by=Mere Tane', actor], /future/);
  const s1 = await call(['sample', '--point=RVW-Z1', `--on=${day(0)}`, '--by=Mere Tane', '--lab=Hill Laboratories', '--lab-ref=RV09001', '--code=S-T1', actor]);
  ok(s1.status === 'at_lab');
  ok(!(await call(['attention'])).some((r) => r.item === 'RVW-Z1 ECOLI'), 'a sample at the lab clears the overdue flag');
  await fail(['result', 'S-T1', '--parameter=Radon', '--value=1', actor], /Unknown parameter/);
  await fail(['result', 'S-T1', '--parameter=ECOLI', '--value=lots', actor], /must be a number/);
  const r1 = await call(['result', 'S-T1', '--parameter=E. coli', '--value=1', '--qualifier=<', actor]);
  ok(r1.verdict === 'ok' && !r1.event_opened);
  await fail(['result', 'S-T1', '--parameter=ECOLI', '--value=5', actor], /never changed/);
  await assert.rejects(() => db.query(`update results set value = 0`), /never changed/); checks++;
  const s2 = await call(['sample', '--point=RVW-Z1', `--on=${day(0)}`, '--by=Mere Tane', '--lab=Hill Laboratories', '--code=S-T2', actor]);
  const r2 = await call(['result', s2.code, '--parameter=ECOLI', '--value=6', actor]);
  ok(r2.verdict === 'over health limit' && /^EV-/.test(r2.event_opened), 'a detection opens an event by itself');
  const ev = r2.event_opened;
  await call(['result', s2.code, '--parameter=FAC', '--value=0.1', actor]);
  await fail(['void', 'S-T2', '--reason=Bottle broken', actor], /never voided away/);
  await fail(['close-event', ev, '--note=x', '--corrective-action=Flushed', actor], /regulator has not been told/);
  await fail(['notify', ev, `--on=${day(-30)}`, '--by=Mere Tane', '--reference=TA-1', actor], /before the event was detected/);
  ok((await call(['notify', ev, `--on=${day(0)}`, '--by=Mere Tane', '--reference=TA-INC-40001', actor])).late === false);
  await fail(['notify', ev, `--on=${day(0)}`, '--by=x', '--reference=y', actor], /was notified/);
  await call(['notice', ev, '--type=boil_water', actor]);
  await fail(['notice', ev, '--type=do_not_drink', actor], /already has/);
  const nd = await call(['draft-notice', ev]);
  ok(fs.readFileSync(nd.file, 'utf8').includes('rolling boil'), 'consumer notice drafted');
  const nn = await call(['draft-notification', ev]);
  ok(fs.readFileSync(nn.file, 'utf8').includes('Taumata Arowai') && fs.readFileSync(nn.file, 'utf8').includes('over health limit'));
  await fail(['lift-notice', ev, actor], /no resample is linked/);
  await fail(['resample', ev, '--sample=S-T1', actor], /not after the sample/);
  await fail(['resample', ev, '--sample=S-BLV-Z1-W01', actor], /another supply/);
  const s3 = await call(['sample', '--point=RVW-Z1', `--on=${day(0)}`, '--by=Mere Tane', '--lab=Hill Laboratories', '--code=S-T3', actor]);
  // Same day as the detection sample: the order is by date, so record a later-dated resample.
  await db.query(`update samples set sampled_on = sampled_on - 1 where code = 'S-T2'`);
  await call(['resample', ev, `--sample=${s3.code}`, actor]);
  await fail(['lift-notice', ev, actor], /no results yet/);
  await call(['result', 'S-T3', '--parameter=ECOLI', '--value=2', actor]);
  await fail(['lift-notice', ev, actor], /not clear/);
  ok((await call(['events'])).filter((r) => r.kind === 'health exceedance' && r.status === 'open').length >= 3, 'the dirty resample opened its own event');
  const s4 = await call(['sample', '--point=RVW-Z1', `--on=${day(0)}`, '--by=Mere Tane', '--lab=Hill Laboratories', '--code=S-T4', actor]);
  await db.query(`update samples set sampled_on = sampled_on - 1 where code = 'S-T3'`);
  await call(['result', 'S-T4', '--parameter=ECOLI', '--value=1', '--qualifier=<', actor]);
  await call(['result', 'S-T4', '--parameter=FAC', '--value=0.6', actor]);
  await call(['resample', ev, '--sample=S-T4', actor]);
  ok((await call(['lift-notice', ev, actor])).notice_lifted_on === day(0));
  await fail(['lift-notice', ev, actor], /no notice in force/);
  await fail(['close-event', ev, '--note=Clear', actor], /no corrective action/);
  ok((await call(['close-event', ev, '--note=Two clear samples; mains break repaired', '--corrective-action=Mains repaired, zone flushed, chlorine raised', actor])).status === 'closed');
  await fail(['close-event', ev, '--note=again', actor], /was closed/);
  ok((await call(['event', ev])).activity.length >= 5, 'every step is in the activity log');

  // The seed's open problems, cleared by hand.
  ok((await call(['raise-event', '--supply=KHS', '--point=KHS-TAP', '--kind=health_exceedance', '--parameter=ECOLI', '--description=E. coli 1 at the kitchen tap', '--code=EV-T9', actor])).notify_regulator.includes('Taumata Arowai'));
  await fail(['raise-event', '--supply=KHS', '--point=RVW-Z1', '--kind=other', '--description=x', actor], /not part of KHS/);
  await fail(['raise-event', '--supply=KHS', '--kind=flood', '--description=x', actor], /must be one of/);
  ok((await call(['register', 'KHS', '--reference=REG-KHS-2201', actor])).registration_ref === 'REG-KHS-2201');
  ok(!(await call(['compliance'])).some((r) => r.rule === 'REGISTRATION'));
  await call(['review-plan', 'Tarawera', actor]);
  ok(!(await call(['attention'])).some((r) => r.item === 'TWS' && r.rule === 'safety plan review overdue'));
  const pa = await call(['add-action', '--supply=RVW', '--hazard=Backflow from the dairy factory', '--action=Fit a testable backflow preventer', '--owner=Mere Tane', `--due=${day(30)}`, actor]);
  ok(/^PA-/.test(pa.code));
  await fail(['complete-action', 'PA-001', '--evidence=', actor], /evidence is required/);
  await call(['complete-action', 'PA-001', '--evidence=Seal replaced; photos on file', actor]);
  await fail(['complete-action', 'PA-001', '--evidence=again', actor], /was completed/);
  const c = await call(['log-complaint', '--supply=RVW', '--kind=illness', '--detail=Child unwell after drinking tap water', '--location=Mill Street', actor]);
  ok(c.next && /^C-/.test(c.code));
  await call(['close-complaint', c.code, '--response=Results checked; public health told', `--event=${ev}`, actor]);
  await fail(['close-complaint', c.code, '--response=again', actor], /was closed/);
  await call(['void', 'S-TWS-Z1-PB', '--reason=Lab lost the bottle', actor]);
  ok(!(await call(['attention'])).some((r) => r.item === 'S-TWS-Z1-PB'));
  await fail(['result', 'S-TWS-Z1-PB', '--parameter=LEAD', '--value=0.001', actor], /voided/);
  ok((await call(['annual-report', 'RVW', `--year=${day(0).slice(0, 4)}`])).results > 0);
  await fail(['annual-report', 'RVW', '--year=nineteen'], /four-digit/);

  // Import from a WaterOutlook export: dry run, reject bad files, import, never twice.
  const res = path.join(REPO_ROOT, 'fixtures', 'wateroutlook-results.csv');
  const rdg = path.join(REPO_ROOT, 'fixtures', 'wateroutlook-readings.csv');
  const dry = await call(['import', 'wateroutlook', `--results=${res}`, `--readings=${rdg}`, '--dry-run', actor]);
  ok(dry.samples_new === 4 && dry.results_new === 6 && dry.readings_rows === 3 && dry.problems.length === 0, 'dry run counts');
  ok((await db.query(`select * from samples where source = 'wateroutlook'`)).length === 0, 'dry run writes nothing');
  const bad = path.join(REPO_ROOT, 'fixtures', 'bad-results.csv');
  const badRun = await call(['import', 'wateroutlook', `--results=${bad}`, '--dry-run', actor]);
  ok(badRun.problems.length === 5, 'every bad row is reported');
  await fail(['import', 'wateroutlook', `--results=${bad}`, actor], /Nothing imported[\s\S]*Nowhere[\s\S]*Radon/);
  await fail(['import', 'other', `--results=${res}`, actor], /Usage: import/);
  await fail(['import', 'wateroutlook', actor], /--results/);
  const imp = await call(['import', 'wateroutlook', `--results=${res}`, `--readings=${rdg}`, actor]);
  ok(imp.samples_new === 4 && imp.readings_new === 3);
  ok(imp.health_results_to_review.length === 1, 'an imported detection is listed for review');
  ok((await call(['attention'])).some((r) => r.rule === 'health result with no event' && r.supply === 'TWS'), 'imported history is checked too');
  const nit = await db.query(`select s.sampled_on, s.reported_on from samples s join results r on r.sample_id = s.id where r.parameter = 'NITRATE' and s.source = 'wateroutlook'`);
  ok(nit[0].sampled_on === '2026-08-15' && nit[0].reported_on === '2026-08-20', 'day-first dates read correctly');
  const again = await call(['import', 'wateroutlook', `--results=${res}`, `--readings=${rdg}`, actor]);
  ok(again.samples_new === 0 && again.readings_new === 0, 'import twice adds nothing');

  // Drafts and export.
  const wk = await call(['weekly-review']);
  ok(fs.readFileSync(wk.file, 'utf8').includes('Needs attention') && wk.needs_attention > 0 && wk.urgent > 0);
  const out = path.join(tmp, 'snapshot.json');
  const snap = await call(['export', `--out=${out}`]);
  ok(snap.tables.samples > 70 && JSON.parse(fs.readFileSync(out, 'utf8')).activity.length > 20);
  await fail(['export', `--out=${out}`], /already exists/);

  // The activity log is append-only.
  await assert.rejects(() => db.query(`update activity set actor = 'someone else'`), /append-only/); checks++;
  await assert.rejects(() => db.query('delete from activity'), /append-only/); checks++;

  for (const name of Object.keys(usage)) ok(exercised.has(name), `smoke exercises ${name}`);
} finally {
  await db.close();
}

// The CLI, views and documents run as a person would run them.
const env = { ...process.env, DATA_DIR: path.join(tmp, 'db'), OUTPUT_DIR: tmp };
for (const args of [['scripts/water.mjs', 'attention'], ['scripts/water.mjs', 'event', 'EV-0002', '--json'], ['scripts/view.mjs'], ['scripts/docs.mjs']]) {
  const r = spawnSync(process.execPath, args, { cwd: REPO_ROOT, env, encoding: 'utf8' });
  assert.equal(r.status, 0, `${args.join(' ')} failed: ${r.stderr}`);
  checks++;
}
const miss = spawnSync(process.execPath, ['scripts/water.mjs', 'supply', 'water'], { cwd: REPO_ROOT, env, encoding: 'utf8' });
assert.equal(miss.status, 1);
assert.match(miss.stderr, /Ambiguous/);
checks++;

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`PASS  ${checks} checks, ${Object.keys(usage).length} commands`);
