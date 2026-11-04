-- Synthetic demo data: four water supplies (three in New Zealand, one in Victoria),
-- twelve weeks of sampling history and the problems a compliance lead meets every
-- week. Dates are relative to today so the attention list always has something to
-- say: an E. coli detection nobody has told the regulator about, a resample that is
-- late, a boil water notice still in force, a positive result at a campground with
-- no event raised, a lab result that never came back, sampling that slipped, a
-- treatment plant out of limit, an overdue safety plan review and an old complaint.
-- Idempotent: safe to run twice. Never run against a real database.

insert into parameters (code, name, unit, category) values
  ('ECOLI', 'E. coli', 'MPN/100 mL', 'microbiological'),
  ('COLIFORMS', 'Total coliforms', 'MPN/100 mL', 'microbiological'),
  ('FAC', 'Free available chlorine', 'mg/L', 'operational'),
  ('TURBIDITY', 'Turbidity', 'NTU', 'physical'),
  ('PH', 'pH', 'pH units', 'physical'),
  ('NITRATE', 'Nitrate', 'mg/L', 'chemical'),
  ('ARSENIC', 'Arsenic', 'mg/L', 'chemical'),
  ('LEAD', 'Lead', 'mg/L', 'chemical'),
  ('MANGANESE', 'Manganese', 'mg/L', 'chemical'),
  ('FLUORIDE', 'Fluoride', 'mg/L', 'chemical')
on conflict (code) do nothing;

-- Limits. Health and aesthetic values come from the instruments cited in
-- docs/compliance.md. Operational limits are the supplier's own (set in its plan).
insert into standards (country, parameter, kind, min_value, max_value, source) values
  ('NZ','ECOLI','health',null,0,'Drinking Water Standards for New Zealand Regulations 2022, Schedule Table 1: E. coli less than 1 in 100 mL'),
  ('NZ','NITRATE','health',null,50,'Drinking Water Standards for New Zealand Regulations 2022, Schedule Table 2 (short-term, as nitrate)'),
  ('NZ','ARSENIC','health',null,0.01,'Drinking Water Standards for New Zealand Regulations 2022, Schedule Table 2'),
  ('NZ','LEAD','health',null,0.01,'Drinking Water Standards for New Zealand Regulations 2022, Schedule Table 2'),
  ('NZ','MANGANESE','health',null,0.4,'Drinking Water Standards for New Zealand Regulations 2022, Schedule Table 2'),
  ('NZ','FLUORIDE','health',null,1.5,'Drinking Water Standards for New Zealand Regulations 2022, Schedule Table 2'),
  ('NZ','FAC','health',null,5,'Drinking Water Standards for New Zealand Regulations 2022, Schedule Table 2: chlorine'),
  ('NZ','FAC','operational',0.2,null,'Drinking Water Quality Assurance Rules 2022, D3.19: at least 0.2 mg/L in 85% of samples, never below 0.1'),
  ('NZ','TURBIDITY','operational',null,1.0,'Drinking Water Quality Assurance Rules 2022, T3: under 1.0 NTU for 95% of each day (chlorine treatment)'),
  ('AU','ECOLI','health',null,0,'Australian Drinking Water Guidelines 2011 v4.0, Table 10.5: not detected in 100 mL'),
  ('AU','NITRATE','health',null,50,'Australian Drinking Water Guidelines 2011 v4.0, Table 10.6 (as nitrate, protects infants)'),
  ('AU','ARSENIC','health',null,0.01,'Australian Drinking Water Guidelines 2011 v4.0, Table 10.6'),
  ('AU','LEAD','health',null,0.005,'Australian Drinking Water Guidelines 2011 v4.0, Table 10.6 (lowered June 2025)'),
  ('AU','MANGANESE','health',null,0.1,'Australian Drinking Water Guidelines 2011 v4.0, Table 10.6'),
  ('AU','MANGANESE','aesthetic',null,0.05,'Australian Drinking Water Guidelines 2011 v4.0, Table 10.6'),
  ('AU','FLUORIDE','health',null,1.5,'Australian Drinking Water Guidelines 2011 v4.0, Table 10.6'),
  ('AU','FAC','health',null,5,'Australian Drinking Water Guidelines 2011 v4.0, Table 10.6: chlorine'),
  ('AU','FAC','operational',0.2,null,'Your risk management plan: minimum free chlorine in the network'),
  ('AU','TURBIDITY','aesthetic',null,5,'Australian Drinking Water Guidelines 2011 v4.0, Table 10.6'),
  ('AU','TURBIDITY','operational',null,1.0,'Australian Drinking Water Guidelines 2011 v4.0: under 1 NTU for effective disinfection')
on conflict (country, parameter, kind) do nothing;

insert into supplies (code, name, country, regulator, supply_type, population, registration_ref, registered_on, operator, plan_reviewed_on, plan_review_months, notify_within_days) values
  ('RVW', 'Riverview Town Supply', 'NZ', 'Taumata Arowai', 'council', 12400, 'REG-RVW-0451', current_date - 900, 'Riverview Water Services', current_date - 300, 12, 1),
  ('TWS', 'Tarawera Rural Water Scheme', 'NZ', 'Taumata Arowai', 'rural_scheme', 640, 'REG-TWS-1187', current_date - 700, 'Tarawera Scheme Committee', current_date - 460, 12, 1),
  ('KHS', 'Kahu Springs Holiday Park', 'NZ', 'Taumata Arowai', 'campground', 180, null, null, 'Kahu Springs Holiday Park Ltd', null, 12, 1),
  ('BLV', 'Bellvale Water', 'AU', 'Department of Health (Victoria)', 'council', 8200, 'VIC-BLV-022', current_date - 2000, 'Bellvale Shire Council', current_date - 200, 12, 10)
on conflict (code) do nothing;

insert into points (code, supply_id, name, kind)
select v.code, s.id, v.name, v.kind from (values
  ('RVW-BORE1','RVW','Riverview bore 1','source'),
  ('RVW-WTP','RVW','Riverview treatment plant','treatment'),
  ('RVW-Z1','RVW','Northern zone (Hill Road hydrant)','distribution'),
  ('RVW-Z2','RVW','Southern zone (Mill Street sample tap)','distribution'),
  ('TWS-INTAKE','TWS','Stream intake','source'),
  ('TWS-UV','TWS','UV and chlorine shed','treatment'),
  ('TWS-Z1','TWS','Scheme network (Lake Road tap)','distribution'),
  ('KHS-BORE','KHS','Campground bore','source'),
  ('KHS-TAP','KHS','Kitchen block tap','distribution'),
  ('BLV-WTP','BLV','Bellvale treatment plant','treatment'),
  ('BLV-Z1','BLV','Bellvale township','distribution'),
  ('BLV-Z2','BLV','East Bellvale','distribution')
) v(code, supply, name, kind) join supplies s on s.code = v.supply
on conflict (code) do nothing;

insert into schedules (point_id, parameter, every_days, starts_on, basis)
select p.id, v.parameter, v.every_days, current_date - 120, v.basis from (values
  ('RVW-Z1','ECOLI',7,'DWQAR 2022 D3.29: weekly per zone under 25,000 people, at most 9 days apart'),
  ('RVW-Z1','FAC',7,'Weekly with the E. coli sample'),
  ('RVW-Z2','ECOLI',7,'DWQAR 2022 D3.29: weekly per zone under 25,000 people, at most 9 days apart'),
  ('RVW-Z2','FAC',7,'Weekly with the E. coli sample'),
  ('RVW-BORE1','NITRATE',91,'Quarterly: nitrate trending up at this bore'),
  ('RVW-BORE1','ARSENIC',365,'Yearly source water check'),
  ('TWS-Z1','ECOLI',7,'DWQAR 2022 D3.29: weekly per zone under 25,000 people, at most 9 days apart'),
  ('TWS-Z1','FAC',7,'Weekly with the E. coli sample'),
  ('TWS-Z1','LEAD',365,'Yearly at the tap'),
  ('KHS-TAP','ECOLI',30,'Monthly at the kitchen tap'),
  ('KHS-TAP','FAC',7,'Weekly chlorine check by park staff'),
  ('BLV-Z1','ECOLI',7,'Weekly, from the risk management plan'),
  ('BLV-Z1','MANGANESE',91,'Quarterly: dirty water history'),
  ('BLV-Z2','ECOLI',7,'Weekly, from the risk management plan'),
  ('BLV-Z2','FAC',7,'Weekly with the E. coli sample')
) v(point, parameter, every_days, basis) join points p on p.code = v.point
on conflict (point_id, parameter) do nothing;

-- Twelve weeks of routine network samples, all clear. Week n is sampled n weeks ago.
-- RVW-Z1 slipped: nothing in the last fortnight. KHS-TAP is monthly and handled below.
insert into samples (code, point_id, sampled_on, sampled_by, lab, lab_ref, status, reported_on)
select 'S-' || p.code || '-W' || lpad(w::text, 2, '0'), p.id, current_date - 7 * w, v.sampler, v.lab,
  v.lab_prefix || lpad((1000 + w * 13)::text, 5, '0'), 'reported', current_date - 7 * w + 2
from (values
  ('RVW-Z1','Mere Tane','Hill Laboratories','RV',2),
  ('RVW-Z2','Mere Tane','Hill Laboratories','RV',1),
  ('TWS-Z1','Ian Cole','Hill Laboratories','TW',1),
  ('BLV-Z1','Jess Moretti','ALS Environmental','BV',1),
  ('BLV-Z2','Jess Moretti','ALS Environmental','BE',1)
) v(point, sampler, lab, lab_prefix, first_week)
join points p on p.code = v.point
cross join generate_series(1, 12) w
where w >= v.first_week
on conflict (code) do nothing;

insert into results (sample_id, parameter, qualifier, value)
select s.id, 'ECOLI', '<', 1 from samples s where s.code like 'S-%-W%'
on conflict (sample_id, parameter) do nothing;

insert into results (sample_id, parameter, qualifier, value)
select s.id, 'FAC', '=', round((0.35 + (substr(s.code, length(s.code) - 1)::int % 5) * 0.08)::numeric, 2)
from samples s join points p on p.id = s.point_id
where s.code like 'S-%-W%' and p.code in ('RVW-Z1','RVW-Z2','TWS-Z1','BLV-Z2')
on conflict (sample_id, parameter) do nothing;

-- One-off samples: the problems.
insert into samples (code, point_id, sampled_on, sampled_by, lab, lab_ref, status, reported_on)
select v.code, p.id, current_date - v.ago, v.sampler, v.lab, v.lab_ref, v.status, case when v.status = 'reported' then current_date - v.reported_ago end
from (values
  ('S-RVW-Z2-E1','RVW-Z2',3,'Mere Tane','Hill Laboratories','RV02201','reported',2),     -- E. coli 2 in the southern zone
  ('S-TWS-Z1-E1','TWS-Z1',10,'Ian Cole','Hill Laboratories','TW02310','reported',9),      -- E. coli 4 on the rural scheme
  ('S-TWS-Z1-R1','TWS-Z1',8,'Ian Cole','Hill Laboratories','TW02316','reported',7),       -- its resample, clear
  ('S-TWS-Z1-PB','TWS-Z1',9,'Ian Cole','Hill Laboratories','TW02312','at_lab',null),      -- yearly lead, never came back
  ('S-KHS-TAP-M1','KHS-TAP',33,'Park manager','Eurofins','KH7718','reported',30),         -- last month's clear sample
  ('S-KHS-TAP-M2','KHS-TAP',3,'Park manager','Eurofins','KH7802','reported',1),           -- E. coli 1 at the kitchen tap
  ('S-KHS-TAP-F1','KHS-TAP',20,'Park manager',null,null,'reported',20),                   -- the last chlorine check
  ('S-RVW-BORE1-Q1','RVW-BORE1',40,'Mere Tane','Hill Laboratories','RV01877','reported',35),
  ('S-RVW-BORE1-Q0','RVW-BORE1',131,'Mere Tane','Hill Laboratories','RV01420','reported',126),
  ('S-BLV-Z1-MN1','BLV-Z1',12,'Jess Moretti','ALS Environmental','BV08812','reported',8),
  ('S-BLV-Z1-MN0','BLV-Z1',103,'Jess Moretti','ALS Environmental','BV08133','reported',99)
) v(code, point, ago, sampler, lab, lab_ref, status, reported_ago)
join points p on p.code = v.point
on conflict (code) do nothing;

insert into results (sample_id, parameter, qualifier, value)
select s.id, v.parameter, v.qualifier, v.value from (values
  ('S-RVW-Z2-E1','ECOLI','=',2), ('S-RVW-Z2-E1','FAC','=',0.08),
  ('S-TWS-Z1-E1','ECOLI','=',4), ('S-TWS-Z1-E1','FAC','=',0.05),
  ('S-TWS-Z1-R1','ECOLI','<',1), ('S-TWS-Z1-R1','FAC','=',0.62),
  ('S-KHS-TAP-M1','ECOLI','<',1),
  ('S-KHS-TAP-M2','ECOLI','=',1),
  ('S-KHS-TAP-F1','FAC','=',0.30),
  ('S-RVW-BORE1-Q1','NITRATE','=',38.5), ('S-RVW-BORE1-Q1','ARSENIC','<',0.001),
  ('S-RVW-BORE1-Q0','NITRATE','=',33.1),
  ('S-BLV-Z1-MN1','MANGANESE','=',0.07),
  ('S-BLV-Z1-MN0','MANGANESE','=',0.04)
) v(sample, parameter, qualifier, value) join samples s on s.code = v.sample
on conflict (sample_id, parameter) do nothing;

-- Events. EV-0001 closed cleanly long ago. EV-0002: boil water notice still on.
-- EV-0003: detected three days ago, regulator not told, resample late.
-- EV-0004: a dirty water event in Victoria left open for weeks.
insert into events (code, supply_id, point_id, result_id, parameter, kind, detected_on, description, notified_on, notified_by, regulator_ref,
  notice, notice_on, notice_lifted_on, resample_due, resample_id, corrective_action, status, closed_on, closeout_note)
select 'EV-0001', su.id, p.id, null, 'TURBIDITY', 'treatment_failure', current_date - 75,
  'Filter 2 turbidity above 1 NTU for 50 minutes after a backwash fault', current_date - 75, 'Mere Tane', 'TA-INC-30418',
  'none', null, null, null, null, 'Backwash valve actuator replaced; filter-to-waste extended to 15 minutes', 'closed', current_date - 61,
  'Turbidity in limit for 14 days; regulator told the event is closed'
from supplies su join points p on p.code = 'RVW-WTP' where su.code = 'RVW'
on conflict (code) do nothing;

insert into events (code, supply_id, point_id, result_id, parameter, kind, detected_on, description, notified_on, notified_by, regulator_ref,
  notice, notice_on, resample_due, resample_id, corrective_action)
select 'EV-0002', su.id, p.id, r.id, 'ECOLI', 'health_exceedance', current_date - 9,
  'E. coli 4 per 100 mL at the Lake Road tap; free chlorine 0.05 mg/L', current_date - 9, 'Ian Cole', 'TA-INC-31877',
  'boil_water', current_date - 9, current_date - 8, rs.id, 'UV lamp replaced, network flushed, chlorine dose raised'
from supplies su join points p on p.code = 'TWS-Z1'
join samples s on s.code = 'S-TWS-Z1-E1' join results r on r.sample_id = s.id and r.parameter = 'ECOLI'
join samples rs on rs.code = 'S-TWS-Z1-R1'
where su.code = 'TWS'
on conflict (code) do nothing;

insert into events (code, supply_id, point_id, result_id, parameter, kind, detected_on, description, resample_due)
select 'EV-0003', su.id, p.id, r.id, 'ECOLI', 'health_exceedance', current_date - 2,
  'E. coli 2 per 100 mL at the Mill Street sample tap; free chlorine 0.08 mg/L', current_date - 1
from supplies su join points p on p.code = 'RVW-Z2'
join samples s on s.code = 'S-RVW-Z2-E1' join results r on r.sample_id = s.id and r.parameter = 'ECOLI'
where su.code = 'RVW'
on conflict (code) do nothing;

insert into events (code, supply_id, point_id, parameter, kind, detected_on, description, notified_on, notified_by, regulator_ref, corrective_action)
select 'EV-0004', su.id, p.id, 'TURBIDITY', 'treatment_failure', current_date - 41,
  'Raw water turbidity spike after storm; clarifier overloaded for six hours', current_date - 40, 'Jess Moretti', 'DH-VIC-55120',
  'Coagulant dose curve reset; jar testing weekly until summer'
from supplies su join points p on p.code = 'BLV-WTP' where su.code = 'BLV'
on conflict (code) do nothing;

-- Daily readings from the plant control systems: last 14 days. Riverview's
-- treatment plant ran over its turbidity limit on two days this week.
insert into daily_readings (point_id, reading_on, parameter, min_value, max_value, minutes_out)
select p.id, current_date - d, v.parameter,
  v.base_min, case when p.code = 'RVW-WTP' and v.parameter = 'TURBIDITY' and d in (2, 5) then 1.6 else v.base_max end,
  case when p.code = 'RVW-WTP' and v.parameter = 'TURBIDITY' and d = 2 then 25 when p.code = 'RVW-WTP' and v.parameter = 'TURBIDITY' and d = 5 then 40 else 0 end
from points p
cross join (values ('TURBIDITY', 0.08, 0.35), ('FAC', 0.9, 1.4)) v(parameter, base_min, base_max)
cross join generate_series(1, 14) d
where p.code in ('RVW-WTP','BLV-WTP','TWS-UV')
on conflict (point_id, reading_on, parameter) do nothing;

insert into plan_actions (code, supply_id, hazard, action, owner, due, done_on, evidence)
select v.code, su.id, v.hazard, v.action, v.owner, current_date + v.due, case when v.done is null then null else current_date - v.done end, v.evidence
from (values
  ('PA-001','RVW','Surface water entering bore 1 headworks','Replace the bore 1 headworks seal and raise the casing above flood level','Mere Tane',-20,null,null),
  ('PA-002','RVW','Single chlorine dosing pump','Install a duty and standby dosing pump with an alarm','Riverview Water Services',45,null,null),
  ('PA-003','TWS','UV lamp failure goes unnoticed','Add a UV intensity alarm to the caretaker phone','Ian Cole',-3,null,null),
  ('PA-004','TWS','Stream intake after heavy rain','Fit a turbidity-triggered intake shut-off','Tarawera Scheme Committee',60,null,null),
  ('PA-005','BLV','Dirty water from old mains in East Bellvale','Unidirectional flushing programme for East Bellvale','Bellvale Shire Council',-90,70,'Flushing completed; report filed with the plan review'),
  ('PA-006','KHS','No treatment record kept','Start a daily chlorine log for the kitchen block tap','Park manager',-10,null,null)
) v(code, supply, hazard, action, owner, due, done, evidence)
join supplies su on su.code = v.supply
on conflict (code) do nothing;

insert into complaints (code, supply_id, received_on, kind, location, detail, response, closed_on)
select v.code, su.id, current_date - v.ago, v.kind, v.location, v.detail, v.response, case when v.closed is null then null else current_date - v.closed end
from (values
  ('C-001','BLV',9,'colour','Hope Street, East Bellvale','Brown water from the kitchen tap in the morning',null,null),
  ('C-002','RVW',30,'taste','Kauri Place','Strong chlorine taste','Dose was raised after a low chlorine result; explained and checked residual',27),
  ('C-003','TWS',10,'illness','Lake Road','Two people in one house with stomach upset','Referred to public health; boil water notice already in force',8),
  ('C-004','RVW',2,'odour','Mill Street','Earthy smell from the bathroom tap',null,null)
) v(code, supply, ago, kind, location, detail, response, closed)
join supplies su on su.code = v.supply
on conflict (code) do nothing;
