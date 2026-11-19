
insert into public.organizations (code, name)
select 'BA-LABS', 'BA Labs'
where not exists (
  select 1 from public.organizations where code = 'BA-LABS'
);

insert into public.batch_qc_templates
  (organization_id, batch_type, check_code, label, required, sequence_no, description)
select
  o.id, v.batch_type, v.check_code, v.label, v.required, v.sequence_no, v.description
from public.organizations o
cross join (
  values
    ('TRICHODERMA','IDENTITY','Identity / strain traceability',true,1,'Confirm organism/strain identity and source traceability.'),
    ('TRICHODERMA','APPEARANCE','Macroscopic appearance / growth',true,2,'Record expected growth and macroscopic characteristics.'),
    ('TRICHODERMA','CONTAMINATION','Contamination check',true,3,'Record presence or absence of visible contamination.'),
    ('TRICHODERMA','STATE','Substrate/product state',true,4,'Record relevant physical state of the batch.'),
    ('PLEUROTUS_SPAWN','STRAIN','Strain identity / traceability',true,1,'Confirm Pleurotus strain identity and traceability.'),
    ('PLEUROTUS_SPAWN','COLONIZATION','Colonization',true,2,'Record colonization state of the spawn.'),
    ('PLEUROTUS_SPAWN','CONTAMINATION','Contamination check',true,3,'Record presence or absence of visible contamination.'),
    ('PLEUROTUS_SPAWN','MYCELIUM','Mycelial appearance',true,4,'Record expected mycelial appearance and uniformity.'),
    ('PLEUROTUS_SPAWN','GRAIN','Grain condition',true,5,'Record relevant grain condition.'),
    ('MUSHROOM_PRODUCT','IDENTITY','Product identity / traceability',true,1,'Confirm product and batch identity.'),
    ('MUSHROOM_PRODUCT','APPEARANCE','Appearance',true,2,'Record expected product appearance.'),
    ('MUSHROOM_PRODUCT','CONTAMINATION','Contamination check',true,3,'Record presence or absence of visible contamination.'),
    ('MUSHROOM_PRODUCT','QUANTITY','Quantity / mass',true,4,'Record actual quantity or mass where applicable.'),
    ('MUSHROOM_PRODUCT','STATE','Product state',true,5,'Record relevant physical/product state.'),
    ('BIOSTIMULANT','TRACEABILITY','Lot / formulation traceability',true,1,'Confirm formulation and lot traceability.'),
    ('BIOSTIMULANT','APPEARANCE','Appearance',true,2,'Record expected appearance.'),
    ('BIOSTIMULANT','HOMOGENEITY','Homogeneity',true,3,'Record homogeneity of the formulation where applicable.'),
    ('BIOSTIMULANT','PH','pH',false,4,'Record pH when applicable; acceptance criteria must be defined separately.'),
    ('BIOSTIMULANT','BIOLOGICAL_PARAMETER','Biological parameter',false,5,'Record the applicable validated biological parameter when available.'),
    ('CULTURE','ORGANISM','Organism / strain',true,1,'Confirm organism and strain traceability.'),
    ('CULTURE','MEDIUM','Culture medium',true,2,'Record medium identity.'),
    ('CULTURE','CONTAMINATION','Contamination check',true,3,'Record presence or absence of visible contamination.'),
    ('CULTURE','GROWTH','Growth',true,4,'Record growth state.'),
    ('CULTURE','OBSERVATION','General observation',true,5,'Record relevant observations.'),
    ('FORMULATION','COMPOSITION','Composition traceability',true,1,'Confirm formulation identity and component traceability.'),
    ('FORMULATION','HOMOGENEITY','Homogeneity',true,2,'Record formulation homogeneity where applicable.'),
    ('FORMULATION','PH','pH',false,3,'Record pH when applicable; acceptance criteria must be defined separately.'),
    ('FORMULATION','QUANTITY','Mass / volume',true,4,'Record actual mass or volume.'),
    ('FORMULATION','TRACEABILITY','Batch traceability',true,5,'Confirm traceability of inputs and resulting formulation.')
) as v(batch_type,check_code,label,required,sequence_no,description)
where o.code = 'BA-LABS'
and not exists (
  select 1
  from public.batch_qc_templates t
  where t.organization_id = o.id
    and t.batch_type = v.batch_type
    and t.check_code = v.check_code
);
