
do $$
declare org uuid;
begin
 select id into org from public.organizations where code='BA-LABS' limit 1;

 insert into public.materials
   (organization_id,material_code,material_type,strain_id,state,generation,metadata)
 select org,
        'MAT-'||s.strain_code,
        'strain',
        s.id,
        'active',
        0,
        jsonb_build_object(
          'source','BA Labs Notion master biological registry',
          'registry_seed',true,
          'generation_semantics','G0 = reference/source material; future propagated materials increment generation',
          'physical_lot_confirmed',false
        )
 from public.strains s
 where s.organization_id=org
 and not exists (
   select 1 from public.materials m
   where m.organization_id=org
     and m.material_code='MAT-'||s.strain_code
 );

end $$;
