-- Threadroom projects. Run with `npm run db:migrate` after the Better Auth tables exist.
create table if not exists project (
  id text primary key,
  name text not null,
  data jsonb not null,
  thumbnail text,
  revision integer not null default 1,
  created_by text not null references "user"(id),
  created_at timestamptz not null default now(),
  updated_by text not null references "user"(id),
  updated_at timestamptz not null default now()
);
create index if not exists project_updated_at on project (updated_at desc);

-- One full snapshot per version. Consecutive autosaves by the same person within
-- a few minutes amend their latest 'edit' version instead of adding a new one.
create table if not exists project_version (
  id text primary key,
  project_id text not null references project(id) on delete cascade,
  number integer not null,
  kind text not null check (kind in ('created','edit','duplicated','restored')),
  data jsonb not null,
  thumbnail text,
  summary jsonb not null default '[]',
  author_id text not null references "user"(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, number)
);
