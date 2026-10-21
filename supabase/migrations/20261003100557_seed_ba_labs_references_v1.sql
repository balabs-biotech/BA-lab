
do $$
declare org uuid;
declare lab uuid;
declare green uuid;
begin
  select id into org from public.organizations where code='BA-LABS' limit 1;

  insert into public.locations (organization_id, code, name, location_type, metadata)
  select org,'SITE','BA Labs — Site Sétif','site','{"status":"active"}'::jsonb
  where not exists (select 1 from public.locations where organization_id=org and code='SITE');

  select id into lab from public.locations where organization_id=org and code='SITE' limit 1;

  insert into public.locations (organization_id, code, name, location_type, parent_location_id, metadata)
  select org,'LAB','Laboratoire de microbiologie / mycologie','laboratory',lab,'{}'::jsonb
  where not exists (select 1 from public.locations where organization_id=org and code='LAB');

  insert into public.locations (organization_id, code, name, location_type, parent_location_id, metadata)
  select org,'GREENHOUSE','Serre expérimentale','greenhouse',lab,'{}'::jsonb
  where not exists (select 1 from public.locations where organization_id=org and code='GREENHOUSE');

  select id into green from public.locations where organization_id=org and code='GREENHOUSE' limit 1;

  insert into public.locations (organization_id, code, name, location_type, parent_location_id, metadata)
  select org,'PRODUCTION','Zone production / préparation','production',lab,'{}'::jsonb
  where not exists (select 1 from public.locations where organization_id=org and code='PRODUCTION');

  insert into public.locations (organization_id, code, name, location_type, parent_location_id, metadata)
  select org,'QC','Zone contrôle qualité','qc',lab,'{}'::jsonb
  where not exists (select 1 from public.locations where organization_id=org and code='QC');

  insert into public.environments (organization_id, location_id, name, metadata)
  select org, green, 'Serre expérimentale — environnement général', '{"purpose":"R&D greenhouse"}'::jsonb
  where not exists (
    select 1 from public.environments
    where organization_id=org and name='Serre expérimentale — environnement général'
  );

  insert into public.environments (organization_id, location_id, name, metadata)
  select org, lab, 'Laboratoire — environnement général', '{"purpose":"microbiology and mycology"}'::jsonb
  where not exists (
    select 1 from public.environments
    where organization_id=org and name='Laboratoire — environnement général'
  );
end $$;

insert into public.organisms (scientific_name, common_name)
select v.scientific_name, v.common_name
from (values
 ('Trichoderma hamatum',null),
 ('Trichoderma harzianum',null),
 ('Trichoderma koningii',null),
 ('Trichoderma longibrachiatum',null),
 ('Trichoderma reesei',null),
 ('Pleurotus ostreatus','Pleurote'),
 ('Pleurotus pulmonarius','Pleurote'),
 ('Pleurotus eryngii','Pleurote du panicaut'),
 ('Hericium erinaceus','Hericium'),
 ('Cordyceps militaris','Cordyceps'),
 ('Ganoderma lucidum','Ganoderme'),
 ('Trametes versicolor','Tramète versicolore')
) v(scientific_name,common_name)
where not exists (
 select 1 from public.organisms o where lower(o.scientific_name)=lower(v.scientific_name)
);

insert into public.protocols (organization_id, code, name, protocol_type, description)
select o.id,v.code,v.name,v.protocol_type,v.description
from public.organizations o
cross join (values
 ('BATCH_INTAKE','Réception et identification d’un lot','production','Traceability and intake of production batches.'),
 ('QC_RELEASE','Contrôle qualité et libération','qc','Operational QC workflow before batch release.'),
 ('CULTURE_TRACE','Traçabilité d’une culture','biology','Culture traceability and event recording.'),
 ('SPAWN_PRODUCTION','Production de spawn','production','Production workflow for mushroom spawn.'),
 ('TRICHODERMA_PRODUCTION','Production de Trichoderma','production','Production workflow for Trichoderma materials.')
) v(code,name,protocol_type,description)
where o.code='BA-LABS'
and not exists (
 select 1 from public.protocols p where p.organization_id=o.id and p.code=v.code
);

insert into public.protocol_versions (organization_id, protocol_id, version, content, parameters)
select p.organization_id,p.id,'1.0',p.description,'{}'::jsonb
from public.protocols p
where p.organization_id=(select id from public.organizations where code='BA-LABS')
and not exists (
 select 1 from public.protocol_versions pv
 where pv.organization_id=p.organization_id and pv.protocol_id=p.id and pv.version='1.0'
);
