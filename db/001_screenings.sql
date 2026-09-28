-- One row per uploaded CV. The file is kept only until the screening finishes, then cleared.
create table if not exists screenings (
  id          uuid primary key,
  file_name   text not null,
  role        text check (role in ('PM', 'Senior PM')),
  status      text not null default 'running' check (status in ('running', 'done', 'error')),
  file_bytes  bytea,
  result      jsonb,
  error       text,
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists screenings_created_at on screenings (created_at desc);
