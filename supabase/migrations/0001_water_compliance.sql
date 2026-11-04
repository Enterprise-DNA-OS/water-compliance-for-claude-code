-- Drinking water compliance for water suppliers: supplies, sampling points,
-- the standards they are held to, the sampling schedule, samples and lab
-- results, events (exceedances, notifications, boil water notices, resamples),
-- the safety plan's improvement actions, consumer complaints, daily treatment
-- readings and an append-only activity log.
-- Plain Postgres; runs the same on PGlite. No extensions.

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create table supplies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  country text not null check (country in ('NZ','AU')),
  regulator text not null,
  supply_type text not null default 'council' check (supply_type in ('council','rural_scheme','campground','school','marae','industrial','private','other')),
  population int not null check (population >= 0),
  registration_ref text,
  registered_on date,
  operator text not null,
  plan_reviewed_on date,              -- drinking water safety plan (NZ) or risk management plan (AU), last review
  plan_review_months int not null default 12 check (plan_review_months between 1 and 60),
  notify_within_days int not null default 1 check (notify_within_days between 0 and 30),  -- how soon after detection the regulator must hear (docs/compliance.md)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table points (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  supply_id uuid not null references supplies(id),
  name text not null,
  kind text not null check (kind in ('source','treatment','reservoir','distribution')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table parameters (
  code text primary key,
  name text not null,
  unit text not null,
  category text not null check (category in ('microbiological','chemical','physical','operational'))
);

-- The limits each country holds a result to. health = a maximum acceptable value
-- or health guideline; aesthetic = taste, look, smell; operational = a limit the
-- supplier sets or a treatment rule sets. Change a limit by changing a row; the
-- source column says where it comes from (docs/compliance.md).
create table standards (
  id uuid primary key default gen_random_uuid(),
  country text not null check (country in ('NZ','AU')),
  parameter text not null references parameters(code),
  kind text not null check (kind in ('health','aesthetic','operational')),
  min_value numeric,
  max_value numeric,
  source text not null,
  unique (country, parameter, kind),
  check (min_value is not null or max_value is not null)
);

create table schedules (
  id uuid primary key default gen_random_uuid(),
  point_id uuid not null references points(id),
  parameter text not null references parameters(code),
  every_days int not null check (every_days between 1 and 1830),
  starts_on date not null default current_date,
  basis text,                         -- why this frequency: the rule or the plan
  active boolean not null default true,
  unique (point_id, parameter)
);

create table samples (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  point_id uuid not null references points(id),
  sampled_on date not null,
  sampled_by text not null,
  lab text,
  lab_ref text,
  status text not null default 'at_lab' check (status in ('at_lab','reported','void')),
  reported_on date,
  void_reason text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reported_on is null or reported_on >= sampled_on),
  check (status <> 'void' or void_reason is not null)
);

create table results (
  id uuid primary key default gen_random_uuid(),
  sample_id uuid not null references samples(id),
  parameter text not null references parameters(code),
  qualifier text not null default '=' check (qualifier in ('<','=','>')),
  value numeric not null,
  created_at timestamptz not null default now(),
  unique (sample_id, parameter)
);

create table events (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  supply_id uuid not null references supplies(id),
  point_id uuid references points(id),
  result_id uuid references results(id),
  parameter text references parameters(code),
  kind text not null check (kind in ('health_exceedance','aesthetic_exceedance','treatment_failure','contamination','complaints','other')),
  detected_on date not null,
  description text not null,
  notified_on date,
  notified_by text,
  regulator_ref text,
  notice text not null default 'none' check (notice in ('none','boil_water','do_not_drink','do_not_use')),
  notice_on date,
  notice_lifted_on date,
  resample_due date,
  resample_id uuid references samples(id),
  corrective_action text,
  status text not null default 'open' check (status in ('open','closed')),
  closed_on date,
  closeout_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (notice = 'none' or notice_on is not null),
  check (notice_lifted_on is null or notice_lifted_on >= notice_on),
  check (status <> 'closed' or (closed_on is not null and closeout_note is not null))
);

-- The safety plan's improvement actions: what the plan said would be fixed, by whom, by when.
create table plan_actions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  supply_id uuid not null references supplies(id),
  hazard text not null,
  action text not null,
  owner text not null,
  due date not null,
  done_on date,
  evidence text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (done_on is null or evidence is not null)
);

create table complaints (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  supply_id uuid not null references supplies(id),
  received_on date not null,
  kind text not null check (kind in ('taste','odour','colour','pressure','illness','other')),
  location text,
  detail text not null,
  response text,
  closed_on date,
  event_id uuid references events(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closed_on is null or response is not null)
);

-- One row per point, day and parameter from the plant's control system export
-- (turbidity, chlorine): the day's minimum, maximum and minutes out of limit.
create table daily_readings (
  id uuid primary key default gen_random_uuid(),
  point_id uuid not null references points(id),
  reading_on date not null,
  parameter text not null references parameters(code),
  min_value numeric,
  max_value numeric,
  minutes_out int not null default 0 check (minutes_out between 0 and 1440),
  unique (point_id, reading_on, parameter)
);

create table imports (
  id bigint generated always as identity primary key,
  source text not null,
  file_name text not null,
  file_sha256 text not null,
  rows_read int not null,
  rows_imported int not null,
  actor text not null,
  created_at timestamptz not null default now()
);

create table activity (
  id bigint generated always as identity primary key,
  actor text not null,
  command text not null,
  record_id text,
  detail text,
  created_at timestamptz not null default now()
);

create index on points (supply_id);
create index on samples (point_id, sampled_on);
create index on results (parameter);
create index on events (supply_id, status);
create index on daily_readings (reading_on);

create trigger supplies_touch before update on supplies for each row execute function touch_updated_at();
create trigger points_touch before update on points for each row execute function touch_updated_at();
create trigger samples_touch before update on samples for each row execute function touch_updated_at();
create trigger events_touch before update on events for each row execute function touch_updated_at();
create trigger plan_actions_touch before update on plan_actions for each row execute function touch_updated_at();
create trigger complaints_touch before update on complaints for each row execute function touch_updated_at();

-- The activity log is append-only.
create or replace function activity_append_only() returns trigger language plpgsql as $$
begin raise exception 'activity is append-only'; end $$;
create trigger activity_no_update before update or delete on activity for each row execute function activity_append_only();

-- A result is never edited or deleted: a wrong result is voided with its sample and resampled.
create or replace function results_locked() returns trigger language plpgsql as $$
begin raise exception 'lab results are never changed: void the sample with a reason and record the resample'; end $$;
create trigger results_no_update before update or delete on results for each row execute function results_locked();

-- ------------------------------------------------------------------ views

-- Every result against its limits. Non-detects ('<') count as below the limit.
create view result_check as
select r.id as result_id, s.code as sample, s.sampled_on, s.lab, su.code as supply, su.country, p.code as point, p.kind as point_kind,
  r.parameter, pa.unit, r.qualifier, r.value,
  h.min_value as health_min, h.max_value as health_max, a.max_value as aesthetic_max, o.min_value as op_min, o.max_value as op_max,
  case
    when r.qualifier <> '<' and h.max_value is not null and r.value > h.max_value then 'over health limit'
    when r.qualifier <> '>' and h.min_value is not null and r.value < h.min_value then 'under health minimum'
    when r.qualifier <> '<' and o.max_value is not null and r.value > o.max_value then 'over operational limit'
    when r.qualifier <> '>' and o.min_value is not null and r.value < o.min_value then 'under operational minimum'
    when r.qualifier <> '<' and a.max_value is not null and r.value > a.max_value then 'over aesthetic value'
    else 'ok'
  end as verdict,
  exists (select 1 from events e where e.result_id = r.id) as has_event
from results r
join samples s on s.id = r.sample_id and s.status <> 'void'
join points p on p.id = s.point_id
join supplies su on su.id = p.supply_id
join parameters pa on pa.code = r.parameter
left join standards h on h.country = su.country and h.parameter = r.parameter and h.kind = 'health'
left join standards a on a.country = su.country and a.parameter = r.parameter and a.kind = 'aesthetic'
left join standards o on o.country = su.country and o.parameter = r.parameter and o.kind = 'operational';

-- When each scheduled sample was last taken and when the next is due.
-- A sample still at the lab counts as taken.
create view sampling_due as
select su.code as supply, p.code as point, p.name as point_name, p.kind as point_kind, sc.parameter, sc.every_days, sc.basis,
  last.sampled_on as last_sampled,
  coalesce(last.sampled_on + sc.every_days, sc.starts_on) as next_due,
  greatest(current_date - coalesce(last.sampled_on + sc.every_days, sc.starts_on), 0) as days_overdue
from schedules sc
join points p on p.id = sc.point_id and p.active
join supplies su on su.id = p.supply_id and su.active
left join lateral (
  select max(s.sampled_on) as sampled_on from samples s
  where s.point_id = sc.point_id and s.status <> 'void'
    and (s.status = 'at_lab' or exists (select 1 from results r where r.sample_id = s.id and r.parameter = sc.parameter))
) last on true
where sc.active;

create view event_register as
select e.code, su.code as supply, su.name as supply_name, su.country, su.regulator, su.notify_within_days, p.code as point, e.kind, e.parameter, e.detected_on,
  e.description, e.notified_on, e.regulator_ref, e.notice, e.notice_on, e.notice_lifted_on, e.resample_due,
  rs.code as resample, rs.status as resample_status, e.status, e.closed_on,
  coalesce(e.closed_on, current_date) - e.detected_on as days_open,
  e.notified_on - e.detected_on as days_to_notify,
  e.notice <> 'none' and e.notice_lifted_on is null as notice_in_force
from events e
join supplies su on su.id = e.supply_id
left join points p on p.id = e.point_id
left join samples rs on rs.id = e.resample_id;

-- What needs a person this week. severity 1 = public health or a legal duty, 2 = overdue work, 3 = housekeeping.
create view supply_attention as
select 1 as severity, supply, sample || ' ' || parameter as item, 'health result with no event' as rule,
  point || ': ' || case when qualifier = '=' then '' else qualifier end || value || ' ' || unit || ' against ' || coalesce('max ' || health_max, 'min ' || health_min) as detail,
  current_date - sampled_on as days
from result_check where verdict in ('over health limit','under health minimum') and not has_event
union all
select 1, supply, code, 'regulator not notified', replace(kind, '_', ' ') || coalesce(' (' || parameter || ')', '') || ' detected ' || detected_on, current_date - detected_on
from event_register where notified_on is null and kind in ('health_exceedance','contamination','treatment_failure') and status = 'open'
union all
select 1, supply, code, 'notice in force', replace(notice, '_', ' ') || ' notice since ' || notice_on, current_date - notice_on
from event_register where notice_in_force
union all
select 1, supply, code, 'resample overdue', 'resample was due ' || resample_due, current_date - resample_due
from event_register where status = 'open' and resample_due < current_date and resample is null
union all
select 2, supply, point || ' ' || parameter, 'sampling overdue', 'every ' || every_days || ' days, last ' || coalesce(last_sampled::text, 'never'), days_overdue
from sampling_due where days_overdue > 0
union all
select 2, su.code, s.code, 'lab result overdue', 'at ' || coalesce(s.lab, 'the lab') || ' since ' || s.sampled_on, current_date - s.sampled_on
from samples s join points p on p.id = s.point_id join supplies su on su.id = p.supply_id
where s.status = 'at_lab' and s.sampled_on < current_date - 5
union all
select 2, su.code, p.code || ' ' || d.parameter, 'treatment out of limit',
  count(*)::int || ' day(s), ' || sum(d.minutes_out) || ' minutes out of limit in the last 7 days', max(current_date - d.reading_on)
from daily_readings d join points p on p.id = d.point_id join supplies su on su.id = p.supply_id
where d.reading_on >= current_date - 7 and d.minutes_out > 0
group by su.code, p.code, d.parameter
union all
select 2, su.code, su.code, 'safety plan review overdue',
  case when su.plan_reviewed_on is null then 'no review recorded' else 'last reviewed ' || su.plan_reviewed_on end,
  case when su.plan_reviewed_on is null then null else current_date - (su.plan_reviewed_on + make_interval(months => su.plan_review_months))::date end
from supplies su where su.active and (su.plan_reviewed_on is null or (su.plan_reviewed_on + make_interval(months => su.plan_review_months))::date < current_date)
union all
select 2, su.code, a.code, 'plan action overdue', a.action || ' (' || a.owner || ')', current_date - a.due
from plan_actions a join supplies su on su.id = a.supply_id where a.done_on is null and a.due < current_date
union all
select 3, su.code, c.code, 'complaint open', c.kind || coalesce(' at ' || c.location, '') || ' since ' || c.received_on, current_date - c.received_on
from complaints c join supplies su on su.id = c.supply_id where c.closed_on is null and c.received_on < current_date - 5
union all
select 3, supply, code, 'event not closed', replace(kind, '_', ' ') || ' open ' || days_open || ' days', days_open
from event_register where status = 'open' and days_open > 30 and not notice_in_force
union all
select 3, su.code, su.code, 'not registered', 'no registration with ' || su.regulator || ' recorded', null
from supplies su where su.active and su.registration_ref is null;

alter table supplies enable row level security;
alter table points enable row level security;
alter table parameters enable row level security;
alter table standards enable row level security;
alter table schedules enable row level security;
alter table samples enable row level security;
alter table results enable row level security;
alter table events enable row level security;
alter table plan_actions enable row level security;
alter table complaints enable row level security;
alter table daily_readings enable row level security;
alter table imports enable row level security;
alter table activity enable row level security;
