
do $$
declare org uuid;
begin
 select id into org from public.organizations where code='BA-LABS' limit 1;

 insert into public.formulations (organization_id, code, name, components)
 select org,v.code,v.name,v.components::jsonb
 from (values
  ('WA','Water Agar','{"status":"documented","components":["water","agar"]}'),
  ('PDA','PDA','{"status":"documented","components":["potato","dextrose","agar"]}'),
  ('GRAIN_WATER','Grain-water medium','{"status":"documented","components":["grain-water"]}'),
  ('DGY_A','DGY-A','{"status":"documented","components":["dextrose","yeast","agar"]}'),
  ('LCMD','LCMD','{"status":"documented","components":["date_molasses","yeast"]}'),
  ('GLIGNEUX','Gligneux','{"status":"documented","components":["date_molasses","biochar","yeast","agar"]}'),
  ('G_CLAIR','G Clair','{"status":"documented","components":["agar","dextrose","honey","yeast"]}'),
  ('MASTER_B','Master B','{"status":"documented","components":["dextrose","protein_broth","biochar","yeast"]}')
 ) v(code,name,components)
 where not exists (
   select 1 from public.formulations f where f.organization_id=org and f.code=v.code
 );

 insert into public.media (organization_id, code, name, formulation_id, metadata)
 select org,f.code,f.name,f.id,'{"status":"active","formula_source":"BA Labs working formulation"}'::jsonb
 from public.formulations f
 where f.organization_id=org
 and not exists (
   select 1 from public.media m where m.organization_id=org and m.code=f.code
 );
end $$;
