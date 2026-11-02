alter table public.ecole_schools add column if not exists devise text;
update public.ecole_schools set devise=coalesce(devise,'Discipline · Unité · Travail') where code='CLR';
update public.ecole_schools set devise=coalesce(devise,'Discipline · Ordre · Travail') where code='2000';
update public.ecole_schools set app_url='/ecole/';

drop function if exists public.racine_mon_ecole();
create function public.racine_mon_ecole() returns table(code text,nom text,actif boolean,logo text,devise text)
language sql stable security definer set search_path=public as $$
  select s.code,s.name,(s.actif or racine_is_admin()),s.logo,s.devise from ecole_members m join ecole_schools s on s.id=m.school_id where m.user_id=auth.uid() limit 1
$$;
grant execute on function public.racine_mon_ecole() to authenticated;

-- code d'accès du directeur d'une école (crée son profil s'il n'existe pas)
create or replace function public.racine_code_directeur(c text, p_code text, p_nom text default null) returns void
language plpgsql security definer set search_path=public as $$
declare sid uuid; nm text;
begin if not racine_is_admin() then raise exception 'non autorisé'; end if;
  if p_code !~ '^[0-9]{4}$' then raise exception 'code à 4 chiffres'; end if;
  select id, coalesce(p_nom, directeur, 'Directeur') into sid, nm from ecole_schools where code=upper(c);
  if sid is null then raise exception 'école inconnue'; end if;
  if exists(select 1 from ecole_codes k where k.school_id=sid and k.code=p_code and k.profile_id<>'p-directeur') then raise exception 'code déjà utilisé dans cette école'; end if;
  insert into ecole_docs(school_id,col,id,data) values(sid,'inscriptions','p-directeur',jsonb_build_object('nom',nm,'role','gestionnaire','matiere','Directeur','prepare',true,'sexe','M','hasCode',true))
    on conflict (school_id,col,id) do update set data=ecole_docs.data||jsonb_build_object('hasCode',true);
  insert into ecole_codes(school_id,profile_id,code) values(sid,'p-directeur',p_code)
    on conflict (school_id,profile_id) do update set code=excluded.code;
end $$;
grant execute on function public.racine_code_directeur(text,text,text) to authenticated;

drop function if exists public.racine_creer_ecole(text,text,text,text,text,text,text);
create or replace function public.racine_creer_ecole(p_nom text,p_code text,p_ville text,p_commune text,p_directeur text,p_couleur text,p_logo text,p_devise text default null,p_code_dir text default null) returns void
language plpgsql security definer set search_path=public as $$
begin if not racine_is_admin() then raise exception 'non autorisé'; end if;
  insert into ecole_schools(name,code,ville,commune,directeur,couleur,logo,devise,actif,paye_jusqua,app_url)
  values(p_nom,upper(p_code),p_ville,p_commune,p_directeur,p_couleur,p_logo,p_devise,true,current_date+30,'/ecole/');
  if p_code_dir is not null and p_code_dir<>'' then perform racine_code_directeur(p_code,p_code_dir,p_directeur); end if;
end $$;
grant execute on function public.racine_creer_ecole(text,text,text,text,text,text,text,text,text) to authenticated;

-- l'annuaire indique aussi si le directeur a déjà un code (console)
drop function if exists public.racine_ecoles();
create function public.racine_ecoles() returns table(code text,nom text,ville text,commune text,directeur text,logo text,couleur text,app text,actif boolean,paye_jusqua date,plan text,classes int,enseignants int,depuis text,code_dir boolean,devise text)
language sql stable security definer set search_path=public as $$
  select s.code,s.name,s.ville,s.commune,s.directeur,s.logo,s.couleur,s.app_url,s.actif,
    case when racine_is_admin() then s.paye_jusqua end, s.plan,
    (select count(*) from ecole_docs d where d.school_id=s.id and d.col='classes')::int,
    (select count(*) from ecole_members m where m.school_id=s.id and m.role='teacher')::int,
    to_char(s.created_at,'YYYY-MM'),
    case when racine_is_admin() then exists(select 1 from ecole_codes k where k.school_id=s.id and k.profile_id='p-directeur') end, s.devise
  from ecole_schools s order by s.created_at
$$;
grant execute on function public.racine_ecoles() to anon, authenticated;
