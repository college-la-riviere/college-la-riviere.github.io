alter table public.ecole_schools add column if not exists theme text;
drop function if exists public.racine_mon_ecole();
create function public.racine_mon_ecole() returns table(code text,nom text,actif boolean,logo text,devise text,theme text)
language sql stable security definer set search_path=public as $$
  select s.code,s.name,(s.actif or racine_is_admin()),s.logo,s.devise,s.theme from ecole_members m join ecole_schools s on s.id=m.school_id where m.user_id=auth.uid() limit 1
$$;
grant execute on function public.racine_mon_ecole() to authenticated;
create or replace function public.racine_set_theme(t text, couleur text) returns void
language plpgsql security definer set search_path=public as $$
declare sid uuid;
begin
  select m.school_id into sid from ecole_members m where m.user_id=auth.uid() and m.role='admin' limit 1;
  if sid is null then raise exception 'réservé à la direction'; end if;
  if t !~ '^[a-z]{2,12}$' then raise exception 'thème inconnu'; end if;
  update ecole_schools set theme=t, couleur=coalesce(nullif(couleur,''),ecole_schools.couleur) where id=sid;
end $$;
grant execute on function public.racine_set_theme(text,text) to authenticated;
