-- racine.ia : plusieurs écoles, ouverture/suspension, paiements
alter table public.ecole_schools add column if not exists actif boolean not null default true;
alter table public.ecole_schools add column if not exists paye_jusqua date default (current_date + 30);
alter table public.ecole_schools add column if not exists plan text default 'Standard';
alter table public.ecole_schools add column if not exists ville text default 'Kinshasa';
alter table public.ecole_schools add column if not exists commune text;
alter table public.ecole_schools add column if not exists directeur text;
alter table public.ecole_schools add column if not exists logo text;
alter table public.ecole_schools add column if not exists couleur text;
alter table public.ecole_schools add column if not exists app_url text;
update public.ecole_schools set commune=coalesce(commune,'Ngaliema'), directeur=coalesce(directeur,'MASUNDA FUTU Chrimos'),
  logo='/clr/icon-192-v3.png', couleur=coalesce(couleur,'linear-gradient(135deg,#1d0f3d,#533989 55%,#8363c6)'), app_url='/clr/',
  paye_jusqua=coalesce(paye_jusqua,'2026-12-01') where code='CLR';

-- équipe racine.ia : le directeur de La Rivière (profil p-directeur) administre la plateforme
create or replace function public.racine_is_admin() returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from ecole_members m join ecole_schools s on s.id=m.school_id
    where m.user_id=auth.uid() and s.code='CLR' and m.profile_id='p-directeur')
$$;

-- une école suspendue n'a plus accès à ses données (sauf l'équipe racine.ia)
create or replace function public.ecole_role(s uuid) returns text
language sql stable security definer set search_path=public as $$
  select m.role from ecole_members m join ecole_schools sc on sc.id=m.school_id
  where m.user_id=auth.uid() and m.school_id=s and (sc.actif or racine_is_admin())
$$;

-- chacun peut toujours lire sa propre fiche de membre (pour afficher « accès suspendu »)
drop policy if exists "ecole_members_read" on public.ecole_members;
create policy "ecole_members_read" on public.ecole_members for select to authenticated
  using (user_id = auth.uid() or ecole_role(school_id) is not null);

-- annuaire public des écoles
drop function if exists public.racine_ecoles();
create function public.racine_ecoles() returns table(code text,nom text,ville text,commune text,directeur text,logo text,couleur text,app text,actif boolean,paye_jusqua date,plan text,classes int,enseignants int,depuis text)
language sql stable security definer set search_path=public as $$
  select s.code,s.name,s.ville,s.commune,s.directeur,s.logo,s.couleur,s.app_url,s.actif,
    case when racine_is_admin() then s.paye_jusqua end, s.plan,
    (select count(*) from ecole_docs d where d.school_id=s.id and d.col='classes')::int,
    (select count(*) from ecole_members m where m.school_id=s.id and m.role='teacher')::int,
    to_char(s.created_at,'YYYY-MM')
  from ecole_schools s order by s.created_at
$$;
grant execute on function public.racine_ecoles() to anon, authenticated;

-- statut de mon école (après connexion)
create or replace function public.racine_mon_ecole() returns table(code text,nom text,actif boolean)
language sql stable security definer set search_path=public as $$
  select s.code,s.name,(s.actif or racine_is_admin()) from ecole_members m join ecole_schools s on s.id=m.school_id where m.user_id=auth.uid() limit 1
$$;
grant execute on function public.racine_mon_ecole() to authenticated;

-- console racine.ia
create or replace function public.racine_set_actif(c text, a boolean) returns void
language plpgsql security definer set search_path=public as $$
begin if not racine_is_admin() then raise exception 'non autorisé'; end if;
  update ecole_schools set actif=a where code=upper(c); end $$;
create or replace function public.racine_payer(c text, mois int default 1) returns date
language plpgsql security definer set search_path=public as $$
declare d date; begin if not racine_is_admin() then raise exception 'non autorisé'; end if;
  update ecole_schools set paye_jusqua=(greatest(coalesce(paye_jusqua,current_date),current_date) + make_interval(months=>mois))::date, actif=true
  where code=upper(c) returning paye_jusqua into d; return d; end $$;
create or replace function public.racine_creer_ecole(p_nom text,p_code text,p_ville text,p_commune text,p_directeur text,p_couleur text,p_logo text) returns void
language plpgsql security definer set search_path=public as $$
begin if not racine_is_admin() then raise exception 'non autorisé'; end if;
  insert into ecole_schools(name,code,ville,commune,directeur,couleur,logo,actif,paye_jusqua)
  values(p_nom,upper(p_code),p_ville,p_commune,p_directeur,p_couleur,p_logo,true,current_date+30); end $$;
grant execute on function public.racine_is_admin(), public.racine_set_actif(text,boolean), public.racine_payer(text,int), public.racine_creer_ecole(text,text,text,text,text,text,text) to authenticated;
