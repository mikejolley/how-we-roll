create extension if not exists "pgcrypto";

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  owner_github_username text not null,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

alter table public.rooms
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;
alter table public.rooms
  add column if not exists owner_github_username text;

-- Slug: up to 72 chars for prefix + random suffix (e.g. team-meetup-x7k2m9pq)
alter table public.rooms drop constraint if exists rooms_slug_format_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'rooms_slug_format_check'
  ) then
    alter table public.rooms
      add constraint rooms_slug_format_check
      check (slug ~ '^[a-z0-9][a-z0-9-]{2,71}$');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'rooms_owner_username_len_check'
  ) then
    alter table public.rooms
      add constraint rooms_owner_username_len_check
      check (char_length(owner_github_username) between 1 and 39);
  end if;
end $$;

create table if not exists public.participants (
  id text primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null,
  emoji text not null,
  color text not null,
  session_id text not null,
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'participants_name_len_check'
  ) then
    alter table public.participants
      add constraint participants_name_len_check
      check (char_length(name) between 1 and 50);
  end if;
end $$;

create index if not exists participants_room_id_idx on public.participants(room_id);

create table if not exists public.responses (
  room_id uuid not null references public.rooms(id) on delete cascade,
  participant_id text not null references public.participants(id) on delete cascade,
  question_id text not null,
  value_0_100 integer not null check (value_0_100 between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (room_id, participant_id, question_id)
);

create index if not exists responses_room_id_idx on public.responses(room_id);
create index if not exists responses_question_id_idx on public.responses(question_id);

alter table public.rooms enable row level security;
alter table public.participants enable row level security;
alter table public.responses enable row level security;

drop policy if exists "rooms_select_all" on public.rooms;
drop policy if exists "rooms_insert_all" on public.rooms;
drop policy if exists "rooms_update_all" on public.rooms;
drop policy if exists "rooms_insert_authenticated_limited" on public.rooms;
drop policy if exists "rooms_update_owner_only" on public.rooms;
drop policy if exists "rooms_delete_owner_only" on public.rooms;
drop policy if exists "participants_select_all" on public.participants;
drop policy if exists "participants_insert_all" on public.participants;
drop policy if exists "participants_update_all" on public.participants;
drop policy if exists "responses_select_all" on public.responses;
drop policy if exists "responses_insert_all" on public.responses;
drop policy if exists "responses_update_all" on public.responses;

create policy "rooms_select_all" on public.rooms
for select
using (true);

create policy "rooms_insert_authenticated_limited" on public.rooms
for insert
to authenticated
with check (
  owner_user_id = auth.uid()
  and (
    select count(*) from public.rooms owner_rooms
    where owner_rooms.owner_user_id = auth.uid()
  ) < 20
);

create policy "rooms_update_owner_only" on public.rooms
for update
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

create policy "rooms_delete_owner_only" on public.rooms
for delete
to authenticated
using (owner_user_id = auth.uid());

create policy "participants_select_all" on public.participants
for select
using (true);

create policy "participants_insert_all" on public.participants
for insert
with check (true);

create policy "participants_update_all" on public.participants
for update
using (true)
with check (true);

create policy "responses_select_all" on public.responses
for select
using (true);

create policy "responses_insert_all" on public.responses
for insert
with check (true);

create policy "responses_update_all" on public.responses
for update
using (true)
with check (true);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'participants'
  ) then
    alter publication supabase_realtime add table public.participants;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'responses'
  ) then
    alter publication supabase_realtime add table public.responses;
  end if;
end $$;
