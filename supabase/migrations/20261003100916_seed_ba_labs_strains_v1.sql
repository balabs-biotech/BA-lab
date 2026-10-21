
do $$
declare org uuid;
begin
 select id into org from public.organizations where code='BA-LABS' limit 1;

 insert into public.strains (organization_id, organism_id, strain_code, designation, source_description, metadata)
 select org,o.id,v.code,v.designation,'Imported from BA Labs Notion master biological registry.','{"source":"Notion master registry","evidence_level":"L0"}'::jsonb
 from (values
  ('Pleurotus ostreatus','BA-PO-HK35','HK35'),
  ('Pleurotus ostreatus','BA-PO-KRYOS','KRYOS / Kryos'),
  ('Pleurotus ostreatus','BA-PO-P80','P80'),
  ('Pleurotus ostreatus','BA-PO-G8','G8'),
  ('Pleurotus ostreatus','BA-PO-BLUE-OYSTER','Blue Oyster'),
  ('Pleurotus ostreatus','BA-PO-GRIS-AMERICAIN','Gris américain'),
  ('Pleurotus pulmonarius','BA-PP-001','Pleurotus pulmonarius'),
  ('Pleurotus eryngii','BA-PE-001','Pleurotus eryngii / ressources hybrides suivies séparément'),
  ('Trichoderma hamatum','BA-TRI-HAM-001','Trichoderma hamatum'),
  ('Trichoderma harzianum','BA-TRI-HAR-001','Trichoderma harzianum'),
  ('Trichoderma koningii','BA-TRI-KON-001','Trichoderma koningii'),
  ('Trichoderma longibrachiatum','BA-TRI-LON-001','Trichoderma longibrachiatum'),
  ('Trichoderma reesei','BA-TRI-REE-001','Trichoderma reesei')
 ) v(scientific_name,code,designation)
 join public.organisms o on o.scientific_name=v.scientific_name
 where not exists (
   select 1 from public.strains s
   where s.organization_id=org and s.strain_code=v.code
 );
end $$;
