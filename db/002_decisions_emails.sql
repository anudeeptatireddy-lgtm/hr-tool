-- Every decision Arjun makes (hard rule 8: timestamp, score, band, rationale), and every email draft and send.
create table if not exists decisions (
  id            uuid primary key default gen_random_uuid(),
  screening_id  uuid not null references screenings(id) on delete cascade,
  decision      text not null check (decision in ('advance', 'decline', 'hold')),
  role          text not null,
  score         numeric not null,
  band          text not null,
  rationale     text not null,
  created_at    timestamptz not null default now()
);
create index if not exists decisions_screening on decisions (screening_id, created_at desc);

create table if not exists emails (
  id            uuid primary key default gen_random_uuid(),
  screening_id  uuid not null references screenings(id) on delete cascade,
  decision_id   uuid references decisions(id) on delete set null,
  kind          text not null check (kind in ('invite', 'decline')),
  candidate_to  text,               -- the address on the CV
  sent_to       text,               -- where it actually went (DEMO_RECIPIENT in demo mode)
  subject       text not null,
  body          text not null,
  drafted_by    text not null,      -- 'ai' or 'template'
  status        text not null default 'draft' check (status in ('draft', 'sent', 'failed')),
  resend_id     text,
  error         text,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);
