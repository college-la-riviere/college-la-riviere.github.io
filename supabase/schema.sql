-- =====================================================================
--  Collège La Rivière — base de données (Supabase / Postgres)
--  À exécuter UNE fois dans Supabase › SQL Editor (projet college-la-riviere).
--  Peut être exécuté plusieurs fois sans danger.
-- =====================================================================

create table if not exists public.ecole_schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,            -- code de l'école à donner aux enseignants (ex. CLR)
  created_at timestamptz default now()
);

create table if not exists public.ecole_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  school_id uuid not null references public.ecole_schools(id) on delete cascade,
  role text not null check (role in ('admin','teacher')),   -- admin = direction / gestionnaire
  profile_id text not null,             -- id du profil (document inscriptions/…)
  nom text,
  phone text,
  created_at timestamptz default now(),
  unique (school_id, profile_id)        -- un profil = un seul compte
);

-- Toutes les données de l'application : une ligne par document
create table if not exists public.ecole_docs (
  school_id uuid not null references public.ecole_schools(id) on delete cascade,
  col text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (school_id, col, id)
);
create index if not exists ecole_docs_col on public.ecole_docs (school_id, col);

-- Codes personnels à 4 chiffres : jamais lisibles depuis l'application
create table if not exists public.ecole_codes (
  school_id uuid not null references public.ecole_schools(id) on delete cascade,
  profile_id text not null,
  code text not null,
  primary key (school_id, profile_id)
);

-- Tentatives (anti-devinette des codes) et usage de l'IA
create table if not exists public.ecole_usage (
  id bigserial primary key,
  kind text not null,                   -- 'join_fail' | 'ia'
  who text not null,                    -- téléphone ou user_id
  at timestamptz not null default now()
);
create index if not exists ecole_usage_k on public.ecole_usage (kind, who, at);

-- ---------------------------------------------------------------------
--  Le code saisi dans l'application part dans ecole_codes, jamais dans data
-- ---------------------------------------------------------------------
create or replace function public.ecole_strip_code() returns trigger
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  new.updated_at := now();
  if new.col = 'inscriptions' and new.data ? 'code' then
    c := nullif(trim(new.data->>'code'), '');
    if c is not null then
      insert into ecole_codes(school_id, profile_id, code) values (new.school_id, new.id, c)
      on conflict (school_id, profile_id) do update set code = excluded.code;
    end if;
    new.data := (new.data - 'code') || jsonb_build_object('hasCode', c is not null or exists(
      select 1 from ecole_codes k where k.school_id = new.school_id and k.profile_id = new.id));
  end if;
  return new;
end $$;
drop trigger if exists ecole_strip_code on public.ecole_docs;
create trigger ecole_strip_code before insert or update on public.ecole_docs
  for each row execute function public.ecole_strip_code();

-- ---------------------------------------------------------------------
--  Fonctions d'accès
-- ---------------------------------------------------------------------
create or replace function public.ecole_role(s uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from ecole_members where user_id = auth.uid() and school_id = s
$$;

create or replace function public.ecole_my_classes(s uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array(select jsonb_array_elements_text(d.data->'classes')), '{}')
  from ecole_members m join ecole_docs d
    on d.school_id = m.school_id and d.col = 'affectations' and d.id = m.profile_id
  where m.user_id = auth.uid() and m.school_id = s
$$;

-- Classe concernée par un document (pour limiter l'enseignant à sa classe)
create or replace function public.ecole_doc_class(s uuid, c text, i text, d jsonb) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(d->>'classeId',''),
    case when c in ('appel','journal') then split_part(i,'__',1) end,
    case when c in ('notes','rapports','signatures') then
      (select e.data->>'classeId' from ecole_docs e where e.school_id = s and e.col = 'eleves' and e.id = split_part(i,'__',1)) end
  )
$$;

-- Lecture : la direction voit tout ; l'enseignant voit les réglages de l'école
-- et uniquement les élèves, cotes, appels et rapports de SA classe.
create or replace function public.ecole_can_read(s uuid, c text, i text, d jsonb) returns boolean
language sql stable security definer set search_path = public as $$
  select case ecole_role(s)
    when 'admin' then true
    when 'teacher' then
      c in ('classes','affectations','inscriptions','config')
      or (c in ('eleves','notes','appel','journal','signatures','rapports','registres')
          and ecole_doc_class(s, c, i, d) = any (ecole_my_classes(s)))
    else false end
$$;

create or replace function public.ecole_can_write(s uuid, c text, i text, d jsonb) returns boolean
language sql stable security definer set search_path = public as $$
  select case ecole_role(s)
    when 'admin' then true
    when 'teacher' then
      (c = 'inscriptions' and i = auth.uid()::text)
      or (c in ('eleves','notes','appel','journal','signatures','rapports','registres')
          and ecole_doc_class(s, c, i, d) = any (ecole_my_classes(s)))
    else false end
$$;

-- ---------------------------------------------------------------------
--  Règles de sécurité (RLS)
-- ---------------------------------------------------------------------
alter table public.ecole_schools enable row level security;
alter table public.ecole_members enable row level security;
alter table public.ecole_docs    enable row level security;
alter table public.ecole_codes   enable row level security;   -- aucune règle : invisible
alter table public.ecole_usage   enable row level security;   -- aucune règle : invisible

drop policy if exists "ecole_schools_read" on public.ecole_schools;
create policy "ecole_schools_read" on public.ecole_schools for select to authenticated
  using (ecole_role(id) is not null);

drop policy if exists "ecole_members_read" on public.ecole_members;
create policy "ecole_members_read" on public.ecole_members for select to authenticated
  using (ecole_role(school_id) is not null);
drop policy if exists "ecole_members_admin" on public.ecole_members;
create policy "ecole_members_admin" on public.ecole_members for delete to authenticated
  using (ecole_role(school_id) = 'admin' and user_id <> auth.uid());

drop policy if exists "ecole_docs_read" on public.ecole_docs;
create policy "ecole_docs_read" on public.ecole_docs for select to authenticated
  using (ecole_can_read(school_id, col, id, data));
drop policy if exists "ecole_docs_insert" on public.ecole_docs;
create policy "ecole_docs_insert" on public.ecole_docs for insert to authenticated
  with check (ecole_can_write(school_id, col, id, data));
drop policy if exists "ecole_docs_update" on public.ecole_docs;
create policy "ecole_docs_update" on public.ecole_docs for update to authenticated
  using (ecole_can_write(school_id, col, id, data))
  with check (ecole_can_write(school_id, col, id, data));
drop policy if exists "ecole_docs_delete" on public.ecole_docs;
create policy "ecole_docs_delete" on public.ecole_docs for delete to authenticated
  using (ecole_can_write(school_id, col, id, data));

-- ---------------------------------------------------------------------
--  Temps réel (le tableau de bord de la direction se met à jour seul)
-- ---------------------------------------------------------------------
alter table public.ecole_docs replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.ecole_docs;
exception when duplicate_object then null; end $$;


-- ---------------------------------------------------------------------
--  Suppressions mémorisées : le téléphone ne retélécharge que ce qui a changé
-- ---------------------------------------------------------------------
create table if not exists public.ecole_deleted (
  school_id uuid not null references public.ecole_schools(id) on delete cascade,
  col text not null,
  id text not null,
  at timestamptz not null default now(),
  primary key (school_id, col, id)
);
create index if not exists ecole_deleted_at on public.ecole_deleted (school_id, at);
create or replace function public.ecole_note_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into ecole_deleted(school_id, col, id, at) values (old.school_id, old.col, old.id, now())
  on conflict (school_id, col, id) do update set at = now();
  return old;
end $$;
drop trigger if exists ecole_note_delete on public.ecole_docs;
create trigger ecole_note_delete after delete on public.ecole_docs
  for each row execute function public.ecole_note_delete();
create or replace function public.ecole_undelete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from ecole_deleted where school_id = new.school_id and col = new.col and id = new.id;
  return new;
end $$;
drop trigger if exists ecole_undelete on public.ecole_docs;
create trigger ecole_undelete after insert on public.ecole_docs
  for each row execute function public.ecole_undelete();
create index if not exists ecole_docs_upd on public.ecole_docs (school_id, updated_at);
alter table public.ecole_deleted enable row level security;
drop policy if exists "ecole_deleted_read" on public.ecole_deleted;
create policy "ecole_deleted_read" on public.ecole_deleted for select to authenticated
  using (ecole_role(school_id) is not null);
revoke all on public.ecole_deleted from anon;
grant select on public.ecole_deleted to authenticated;

-- ---------------------------------------------------------------------
--  Droits d'accès des comptes connectés (les visiteurs anonymes : rien)
-- ---------------------------------------------------------------------
revoke all on public.ecole_schools, public.ecole_members, public.ecole_docs, public.ecole_codes, public.ecole_usage from anon;
revoke all on public.ecole_codes, public.ecole_usage from authenticated;
grant select on public.ecole_schools to authenticated;
grant select, delete on public.ecole_members to authenticated;
grant select, insert, update, delete on public.ecole_docs to authenticated;
