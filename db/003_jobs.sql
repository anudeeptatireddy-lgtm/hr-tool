-- Jobs live in the database so new ones can be created with their own rubric.
-- kind 'pattern': the two Kargo roles, scored by the back-tested past-hire rubric (src/scoring.ts).
-- kind 'generated': rubric generated from the job's own text, reviewed and approved before use.
create table if not exists jobs (
  ref             text primary key,
  title           text not null,
  location        text not null default '',
  reports_to      text not null default '',
  opened_on       date not null default current_date,
  requirement     text not null default '',
  gates           jsonb not null default '{}',   -- generated jobs: {minYears, requireMumbai}
  gate_notes      text[] not null default '{}',  -- human-readable gate lines shown in the UI
  kind            text not null check (kind in ('pattern', 'generated')),
  role            text check (role in ('PM', 'Senior PM')),
  rubric          jsonb,                         -- {signals: [...]} ; null until generated
  rubric_version  int not null default 1,
  rubric_status   text not null default 'draft' check (rubric_status in ('draft', 'approved')),
  jd_file         text,
  created_at      timestamptz not null default now()
);

insert into jobs (ref, title, location, reports_to, opened_on, requirement, gate_notes, kind, role, rubric_status, jd_file) values
  ('KRG-PM-01', 'Product Manager', 'Mumbai · in-office', 'Arjun Mehta, Founder', '2026-07-13',
   '2–4 years of product management, ideally building for the first time',
   array['1.5–5 yrs PM (adjacent roles count half)', 'Mumbai or willing to relocate'], 'pattern', 'PM', 'approved', '/jds/product-manager.docx'),
  ('KRG-SPM-01', 'Senior Product Manager', 'Mumbai · in-office', 'Arjun Mehta, Founder', '2026-07-13',
   '5–8 years of product management, owning an area with no senior PMs above; integration or platform work',
   array['4–9 yrs PM', 'Owned an integration or platform area', 'Mumbai or willing to relocate'], 'pattern', 'Senior PM', 'approved', '/jds/senior-product-manager.docx')
on conflict (ref) do nothing;

alter table screenings add column if not exists job_ref text references jobs(ref);
alter table screenings add column if not exists rubric_version int;
update screenings set job_ref = case when coalesce(role, result->>'roleUsed') = 'Senior PM' then 'KRG-SPM-01' else 'KRG-PM-01' end where job_ref is null;
