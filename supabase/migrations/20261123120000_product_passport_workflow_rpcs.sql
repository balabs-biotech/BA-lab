-- Canonical product-passport RPC layer reconstructed from the active BA Labs project.
-- All privileged operations are invoker-rights and executable only by service_role.
-- Edge Functions authenticate the user, resolve application roles, then call these RPCs.

CREATE OR REPLACE FUNCTION public.approve_alert_with_audit(p_alert_id uuid, p_actor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ declare v_id uuid; begin
if p_actor_id is null then raise exception 'actor_id_required' using errcode='22023'; end if; update public.alerts set status='approved',approved_by=p_actor_id,approved_at=now() where id=p_alert_id and status='draft' returning id into v_id; if v_id is null then raise exception 'alert_not_found_or_not_draft' using errcode='P0002'; end if;
insert into public.audit_events(actor_id,action,target_type,target_id,outcome,metadata) values(p_actor_id,'alert.approved','alert',v_id::text,'success',jsonb_build_object('source','admin_ui')); return v_id; end; $function$;

CREATE OR REPLACE FUNCTION public.archive_document_with_audit(p_document_id uuid, p_actor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
  if p_actor_id is null or p_document_id is null then raise exception 'document_archive_input_invalid' using errcode='22023'; end if;
  update public.documents set archived_at=now(),published_by=null,published_at=null
  where id=p_document_id and archived_at is null returning id into v_id;
  if v_id is null then raise exception 'document_not_found_or_archived' using errcode='P0002'; end if;
  insert into public.audit_events(actor_id,action,target_type,target_id,outcome,metadata)
  values(p_actor_id,'document.archived','document',v_id::text,'success',
    jsonb_build_object('permission','documents:publish','source','admin_ui'));
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_alert_draft_with_audit(p_incident_id uuid, p_public_title text, p_public_summary text, p_actor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ declare v_incident public.incidents%rowtype; v_id uuid; begin
if p_actor_id is null or p_public_title is null or length(btrim(p_public_title)) not between 2 and 160 or p_public_summary is null or length(btrim(p_public_summary)) not between 2 and 1200 then raise exception 'invalid_alert_input' using errcode='22023'; end if;
select * into v_incident from public.incidents where id=p_incident_id for share; if not found then raise exception 'incident_not_found' using errcode='P0002'; end if; if v_incident.status='closed' then raise exception 'closed_incident_cannot_be_alerted' using errcode='23514'; end if;
insert into public.alerts(incident_id,scope_type,lot_id,product_id,category_id,status,public_title,public_summary,prepared_by)
values(v_incident.id,v_incident.scope_type,v_incident.lot_id,v_incident.product_id,v_incident.category_id,'draft',btrim(p_public_title),btrim(p_public_summary),p_actor_id) returning id into v_id;
insert into public.audit_events(actor_id,action,target_type,target_id,outcome,metadata) values(p_actor_id,'alert.prepared','alert',v_id::text,'success',jsonb_build_object('source','admin_ui','incidentId',p_incident_id::text)); return v_id; end; $function$;

CREATE OR REPLACE FUNCTION public.create_incident_with_scope_with_audit(p_scope_type text, p_lot_id uuid, p_product_id uuid, p_category_id uuid, p_severity text, p_title text, p_internal_description text, p_actor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ declare v_id uuid; begin
if p_actor_id is null or p_title is null or length(btrim(p_title)) not between 2 and 160 or p_severity not in ('low','medium','high','critical') or p_scope_type not in ('lot','product','family')
or (p_scope_type='lot' and (p_lot_id is null or p_product_id is not null or p_category_id is not null))
or (p_scope_type='product' and (p_product_id is null or p_lot_id is not null or p_category_id is not null))
or (p_scope_type='family' and (p_category_id is null or p_lot_id is not null or p_product_id is not null))
or (p_internal_description is not null and length(p_internal_description)>5000) then raise exception 'invalid_incident_input' using errcode='22023'; end if;
insert into public.incidents(scope_type,lot_id,product_id,category_id,severity,title,internal_description,created_by)
values(p_scope_type,p_lot_id,p_product_id,p_category_id,p_severity,btrim(p_title),nullif(btrim(p_internal_description),''),p_actor_id) returning id into v_id;
insert into public.audit_events(actor_id,action,target_type,target_id,outcome,metadata) values(p_actor_id,'incident.created','incident',v_id::text,'success',jsonb_build_object('source','admin_ui','scopeType',p_scope_type,'severity',p_severity)); return v_id; end; $function$;

CREATE OR REPLACE FUNCTION public.create_lot_with_audit(p_product_id uuid, p_lot_code text, p_manufactured_on date, p_expires_on date, p_quantity numeric, p_quantity_unit text, p_internal_notes text, p_actor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_lot_id uuid;
begin
  if p_actor_id is null then raise exception 'actor_id_required' using errcode = '22023'; end if;
  if (p_quantity is null) <> (nullif(pg_catalog.btrim(p_quantity_unit), '') is null) then
    raise exception 'quantity_and_unit_must_be_provided_together' using errcode = '22023';
  end if;
  insert into public.lots (product_id, lot_code, manufactured_on, expires_on, quantity, quantity_unit, internal_notes, created_by)
  values (p_product_id, pg_catalog.upper(pg_catalog.btrim(p_lot_code)), p_manufactured_on, p_expires_on, p_quantity, nullif(pg_catalog.btrim(p_quantity_unit), ''), nullif(pg_catalog.btrim(p_internal_notes), ''), p_actor_id)
  returning id into v_lot_id;
  insert into public.lot_events(lot_id,event_type,actor_id,details)
  values (v_lot_id,'created',p_actor_id,pg_catalog.jsonb_build_object('lot_code',pg_catalog.upper(pg_catalog.btrim(p_lot_code))));
  insert into public.audit_events (actor_id, action, target_type, target_id, outcome, metadata)
  values (p_actor_id,'lot.created','lot',v_lot_id::text,'success',pg_catalog.jsonb_build_object('permission','lots:create','source','admin_ui'));
  return v_lot_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_passport_draft_with_audit(p_lot_id uuid, p_qr_token_hash text, p_actor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ declare v_id uuid; begin
if p_actor_id is null or p_qr_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_passport_input' using errcode='22023'; end if;
if not exists(select 1 from public.lots where id=p_lot_id and status='released') then raise exception 'lot_not_released' using errcode='23514'; end if;
insert into public.passports(lot_id,qr_token_hash,status,current_version) values(p_lot_id,p_qr_token_hash,'draft',0) returning id into v_id;
insert into public.audit_events(actor_id,action,target_type,target_id,outcome,metadata) values(p_actor_id,'passport.created','passport',v_id::text,'success',jsonb_build_object('source','admin_ui','lotId',p_lot_id::text)); return v_id; end; $function$;

CREATE OR REPLACE FUNCTION public.create_product_with_public_info_with_audit(p_category_id uuid, p_code text, p_name_fr text, p_name_en text, p_name_pt text, p_name_ar text, p_internal_description text, p_public_description_fr text, p_public_usage_fr text, p_actor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ declare v_product_id uuid; begin
if p_actor_id is null then raise exception 'actor_id_required' using errcode='22023'; end if;
if (p_public_description_fr is not null and length(p_public_description_fr)>1500) or (p_public_usage_fr is not null and length(p_public_usage_fr)>2500) then raise exception 'public_product_info_too_long' using errcode='22023'; end if;
insert into public.products(category_id,code,name_fr,name_en,name_pt,name_ar,internal_description,public_description_fr,public_usage_fr,created_by)
values(p_category_id,upper(btrim(p_code)),btrim(p_name_fr),nullif(btrim(p_name_en),''),nullif(btrim(p_name_pt),''),nullif(btrim(p_name_ar),''),nullif(btrim(p_internal_description),''),nullif(btrim(p_public_description_fr),''),nullif(btrim(p_public_usage_fr),''),p_actor_id)
returning id into v_product_id;
insert into public.audit_events(actor_id,action,target_type,target_id,outcome,metadata) values(p_actor_id,'product.created','product',v_product_id::text,'success',jsonb_build_object('permission','catalog:manage','source','admin_ui'));
return v_product_id; end; $function$;

CREATE OR REPLACE FUNCTION public.publish_alert_with_audit(p_alert_id uuid, p_actor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ declare v_id uuid; begin
if p_actor_id is null then raise exception 'actor_id_required' using errcode='22023'; end if; update public.alerts set status='published',published_at=now() where id=p_alert_id and status='approved' and approved_by is not null and approved_at is not null returning id into v_id; if v_id is null then raise exception 'alert_not_approved_or_not_found' using errcode='P0002'; end if;
insert into public.audit_events(actor_id,action,target_type,target_id,outcome,metadata) values(p_actor_id,'alert.published','alert',v_id::text,'success',jsonb_build_object('source','admin_ui')); return v_id; end; $function$;

CREATE OR REPLACE FUNCTION public.publish_passport_with_audit(p_passport_id uuid, p_actor_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ declare v_passport public.passports%rowtype; v_lot public.lots%rowtype; v_product public.products%rowtype; v_category public.product_categories%rowtype; v_version integer; v_snapshot jsonb; v_alerts jsonb; v_checks integer; begin
if p_actor_id is null then raise exception 'actor_id_required' using errcode='22023'; end if;
select * into v_passport from public.passports where id=p_passport_id for update;
if not found or v_passport.status not in ('draft','published') then raise exception 'passport_not_publishable' using errcode='P0002'; end if;
select * into v_lot from public.lots where id=v_passport.lot_id; if not found or v_lot.status<>'released' then raise exception 'lot_not_released' using errcode='23514'; end if;
select * into v_product from public.products where id=v_lot.product_id; select * into v_category from public.product_categories where id=v_product.category_id;
select count(*) into v_checks from public.quality_checks where lot_id=v_lot.id and result='pass' and reviewed_by is not null and reviewed_at is not null;
select coalesce(jsonb_agg(jsonb_build_object('title',a.public_title,'summary',a.public_summary,'scope',a.scope_type,'published_at',a.published_at) order by a.published_at desc),'[]'::jsonb) into v_alerts from public.alerts a where a.status='published' and ((a.scope_type='lot' and a.lot_id=v_lot.id) or (a.scope_type='product' and a.product_id=v_product.id) or (a.scope_type='family' and a.category_id=v_product.category_id));
v_version:=v_passport.current_version+1;
v_snapshot:=jsonb_build_object('schema_version','1.0','passport_code',v_lot.lot_code,'product',jsonb_build_object('code',v_product.code,'name',v_product.name_fr,'category',v_category.name_fr,'description',v_product.public_description_fr,'usage',v_product.public_usage_fr),'lot',jsonb_build_object('code',v_lot.lot_code,'manufactured_on',v_lot.manufactured_on,'expires_on',v_lot.expires_on),'quality',jsonb_build_object('status','released','reviewed_passing_checks',v_checks),'status',v_lot.status,'published_at',now(),'alerts',v_alerts,'documents','[]'::jsonb);
insert into public.passport_versions(passport_id,version,snapshot,published_by) values(v_passport.id,v_version,v_snapshot,p_actor_id);
update public.passports set status='published',current_version=v_version,published_by=p_actor_id,published_at=now(),revoked_by=null,revoked_at=null where id=v_passport.id;
insert into public.audit_events(actor_id,action,target_type,target_id,outcome,metadata) values(p_actor_id,'passport.published','passport',v_passport.id::text,'success',jsonb_build_object('version',v_version,'lotId',v_lot.id::text)); return v_version; end; $function$;

CREATE OR REPLACE FUNCTION public.record_quality_check_with_audit(p_lot_id uuid, p_check_type text, p_result text, p_internal_notes text, p_actor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_check_id uuid;
begin
  if p_actor_id is null then raise exception 'actor_id_required' using errcode = '22023'; end if;
  insert into public.quality_checks (lot_id,check_type,result,checked_by,internal_notes)
  values (p_lot_id,pg_catalog.btrim(p_check_type),p_result,p_actor_id,nullif(pg_catalog.btrim(p_internal_notes),'')) returning id into v_check_id;
  insert into public.lot_events(lot_id,event_type,actor_id,details)
  values (p_lot_id,'sampling',p_actor_id,pg_catalog.jsonb_build_object('check_id',v_check_id,'check_type',pg_catalog.btrim(p_check_type),'result',p_result));
  insert into public.audit_events(actor_id,action,target_type,target_id,outcome,metadata)
  values (p_actor_id,'quality.check_recorded','lot',p_lot_id::text,'success',pg_catalog.jsonb_build_object('source','admin_ui','result',p_result));
  return v_check_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.register_document_upload_with_audit(p_lot_id uuid, p_product_id uuid, p_storage_path text, p_original_filename text, p_mime_type text, p_byte_size bigint, p_classification text, p_title text, p_description text, p_actor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_product_id uuid;
begin
  if p_actor_id is null then
    raise exception 'actor_id_required' using errcode='22023';
  end if;

  if (p_lot_id is null) = (p_product_id is null) then
    raise exception 'document_scope_required' using errcode='22023';
  end if;

  if p_lot_id is not null then
    select l.product_id into v_product_id
    from public.lots l where l.id=p_lot_id;
    if v_product_id is null then
      raise exception 'lot_not_found' using errcode='P0002';
    end if;
    if p_storage_path is null
       or p_storage_path not like 'lots/' || p_lot_id::text || '/%'
    then
      raise exception 'document_storage_scope_mismatch' using errcode='22023';
    end if;
  else
    if not exists(select 1 from public.products p where p.id=p_product_id) then
      raise exception 'product_not_found' using errcode='P0002';
    end if;
    if p_storage_path is null
       or p_storage_path not like 'products/' || p_product_id::text || '/%'
    then
      raise exception 'document_storage_scope_mismatch' using errcode='22023';
    end if;
  end if;

  if p_storage_path is null
     or p_storage_path !~ '^(lots|products)/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]pdf$'
     or p_mime_type is distinct from 'application/pdf'
     or p_byte_size is null or p_byte_size < 1 or p_byte_size > 3145728
  then
    raise exception 'document_file_invalid' using errcode='22023';
  end if;

  if p_classification is null or p_classification not in ('internal','quality') then
    raise exception 'document_classification_invalid' using errcode='22023';
  end if;

  if p_original_filename is null
     or length(btrim(p_original_filename)) not between 1 and 255
     or p_title is null
     or length(btrim(p_title)) not between 1 and 160
     or (p_description is not null and length(p_description)>1200)
  then
    raise exception 'document_metadata_invalid' using errcode='22023';
  end if;

  insert into public.documents(
    lot_id,product_id,storage_path,original_filename,mime_type,byte_size,
    classification,uploaded_by,title,description
  )
  values(
    p_lot_id,p_product_id,p_storage_path,btrim(p_original_filename),
    p_mime_type,p_byte_size,p_classification,p_actor_id,btrim(p_title),
    nullif(btrim(p_description),'')
  )
  returning id into v_id;

  insert into public.audit_events(
    actor_id,action,target_type,target_id,outcome,metadata
  )
  values(
    p_actor_id,'document.uploaded','document',v_id::text,'success',
    jsonb_build_object(
      'permission','documents:upload',
      'source','admin_ui',
      'classification',p_classification,
      'byte_size',p_byte_size
    )
  );

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.release_lot_with_audit(p_lot_id uuid, p_actor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_lot_id uuid;
begin
  if p_actor_id is null then raise exception 'actor_id_required' using errcode = '22023'; end if;
  update public.lots set status='released',updated_at=pg_catalog.now()
  where id=p_lot_id and status='awaiting_checks' returning id into v_lot_id;
  if v_lot_id is null then raise exception 'lot_not_found_or_not_awaiting_checks' using errcode = 'P0002'; end if;
  insert into public.lot_events(lot_id,event_type,actor_id,details)
  values (v_lot_id,'status_changed',p_actor_id,pg_catalog.jsonb_build_object('from','awaiting_checks','to','released','reason','quality_release'));
  insert into public.audit_events(actor_id,action,target_type,target_id,outcome,metadata)
  values (p_actor_id,'quality.released','lot',v_lot_id::text,'success',pg_catalog.jsonb_build_object('source','admin_ui'));
  return v_lot_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.review_quality_check_with_audit(p_check_id uuid, p_actor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_lot_id uuid;
begin
  if p_actor_id is null then raise exception 'actor_id_required' using errcode = '22023'; end if;
  update public.quality_checks set reviewed_by=p_actor_id,reviewed_at=pg_catalog.now()
  where id=p_check_id and reviewed_by is null returning lot_id into v_lot_id;
  if v_lot_id is null then raise exception 'quality_check_not_found_or_already_reviewed' using errcode = 'P0002'; end if;
  insert into public.lot_events(lot_id,event_type,actor_id,details)
  values (v_lot_id,'note',p_actor_id,pg_catalog.jsonb_build_object('event','quality_check_reviewed','check_id',p_check_id));
  insert into public.audit_events(actor_id,action,target_type,target_id,outcome,metadata)
  values (p_actor_id,'quality.check_reviewed','lot',v_lot_id::text,'success',pg_catalog.jsonb_build_object('source','admin_ui','check_id',p_check_id::text));
  return p_check_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_passport_with_audit(p_passport_id uuid, p_actor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ declare v_id uuid; begin
if p_actor_id is null then raise exception 'actor_id_required' using errcode='22023'; end if;
update public.passports set status='revoked',revoked_by=p_actor_id,revoked_at=now() where id=p_passport_id and status='published' returning id into v_id;
if v_id is null then raise exception 'passport_not_published_or_not_found' using errcode='P0002'; end if;
insert into public.audit_events(actor_id,action,target_type,target_id,outcome,metadata) values(p_actor_id,'passport.revoked','passport',v_id::text,'success',jsonb_build_object('source','admin_ui')); return v_id; end; $function$;

CREATE OR REPLACE FUNCTION public.rotate_passport_token_with_audit(p_passport_id uuid, p_qr_token_hash text, p_actor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ declare v_id uuid; begin
if p_actor_id is null or p_qr_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_passport_token' using errcode='22023'; end if;
update public.passports set qr_token_hash=p_qr_token_hash,status='draft',revoked_by=null,revoked_at=null where id=p_passport_id and status='revoked' returning id into v_id;
if v_id is null then raise exception 'passport_not_revoked_or_not_found' using errcode='P0002'; end if;
insert into public.audit_events(actor_id,action,target_type,target_id,outcome,metadata) values(p_actor_id,'passport.token_rotated','passport',v_id::text,'success',jsonb_build_object('source','admin_ui'));
return v_id; end; $function$;

CREATE OR REPLACE FUNCTION public.transition_lot_with_audit(p_lot_id uuid, p_new_status text, p_reason text, p_actor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_lot public.lots%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if p_actor_id is null then
    raise exception 'actor_id_required' using errcode = '22023';
  end if;

  select * into v_lot
  from public.lots
  where id = p_lot_id
  for update;

  if not found then
    raise exception 'lot_not_found' using errcode = 'P0002';
  end if;

  if not (
    (v_lot.status = 'draft' and p_new_status = 'in_production')
    or (v_lot.status = 'in_production' and p_new_status = 'awaiting_checks')
    or (v_lot.status = 'awaiting_checks' and p_new_status = 'investigation')
    or (v_lot.status = 'investigation' and p_new_status = 'awaiting_checks')
    or (v_lot.status = 'released' and p_new_status = 'under_surveillance')
    or (v_lot.status = 'under_surveillance' and p_new_status = 'awaiting_checks')
  ) then
    raise exception 'invalid_lot_status_transition' using errcode = '23514';
  end if;

  if p_new_status in ('investigation', 'under_surveillance') and v_reason is null then
    raise exception 'transition_reason_required' using errcode = '22023';
  end if;

  update public.lots
  set status = p_new_status,
      updated_at = pg_catalog.now()
  where id = p_lot_id;

  insert into public.lot_events(lot_id, event_type, actor_id, details)
  values (
    p_lot_id,
    'status_changed',
    p_actor_id,
    pg_catalog.jsonb_build_object(
      'from', v_lot.status,
      'to', p_new_status,
      'reason', v_reason
    )
  );

  insert into public.audit_events(actor_id, action, target_type, target_id, outcome, metadata)
  values (
    p_actor_id,
    'lot.status_changed',
    'lot',
    p_lot_id::text,
    'success',
    pg_catalog.jsonb_build_object('from', v_lot.status, 'to', p_new_status)
  );

  return p_lot_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_incident_with_audit(p_incident_id uuid, p_status text, p_root_cause text, p_corrective_actions text, p_actor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ declare v_id uuid; begin
if p_actor_id is null or p_status not in ('open','investigating','corrective_action','resolved','closed') or (p_root_cause is not null and length(p_root_cause)>5000) or (p_corrective_actions is not null and length(p_corrective_actions)>5000) then raise exception 'invalid_incident_update' using errcode='22023'; end if;
update public.incidents set status=p_status,root_cause=nullif(btrim(p_root_cause),''),corrective_actions=nullif(btrim(p_corrective_actions),''),resolved_at=case when p_status in ('resolved','closed') then coalesce(resolved_at,now()) else null end where id=p_incident_id returning id into v_id;
if v_id is null then raise exception 'incident_not_found' using errcode='P0002'; end if;
insert into public.audit_events(actor_id,action,target_type,target_id,outcome,metadata) values(p_actor_id,'incident.updated','incident',v_id::text,'success',jsonb_build_object('source','admin_ui','changedFields',jsonb_build_array('status','root_cause','corrective_actions'))); return v_id; end; $function$


-- Do not expose privileged workflow RPCs to browser roles.
REVOKE ALL ON FUNCTION public.approve_alert_with_audit(p_alert_id uuid, p_actor_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_alert_with_audit(p_alert_id uuid, p_actor_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.archive_document_with_audit(p_document_id uuid, p_actor_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_document_with_audit(p_document_id uuid, p_actor_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.create_alert_draft_with_audit(p_incident_id uuid, p_public_title text, p_public_summary text, p_actor_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_alert_draft_with_audit(p_incident_id uuid, p_public_title text, p_public_summary text, p_actor_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.create_incident_with_scope_with_audit(p_scope_type text, p_lot_id uuid, p_product_id uuid, p_category_id uuid, p_severity text, p_title text, p_internal_description text, p_actor_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_incident_with_scope_with_audit(p_scope_type text, p_lot_id uuid, p_product_id uuid, p_category_id uuid, p_severity text, p_title text, p_internal_description text, p_actor_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.create_lot_with_audit(p_product_id uuid, p_lot_code text, p_manufactured_on date, p_expires_on date, p_quantity numeric, p_quantity_unit text, p_internal_notes text, p_actor_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_lot_with_audit(p_product_id uuid, p_lot_code text, p_manufactured_on date, p_expires_on date, p_quantity numeric, p_quantity_unit text, p_internal_notes text, p_actor_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.create_passport_draft_with_audit(p_lot_id uuid, p_qr_token_hash text, p_actor_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_passport_draft_with_audit(p_lot_id uuid, p_qr_token_hash text, p_actor_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.create_product_with_public_info_with_audit(p_category_id uuid, p_code text, p_name_fr text, p_name_en text, p_name_pt text, p_name_ar text, p_internal_description text, p_public_description_fr text, p_public_usage_fr text, p_actor_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_product_with_public_info_with_audit(p_category_id uuid, p_code text, p_name_fr text, p_name_en text, p_name_pt text, p_name_ar text, p_internal_description text, p_public_description_fr text, p_public_usage_fr text, p_actor_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.publish_alert_with_audit(p_alert_id uuid, p_actor_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_alert_with_audit(p_alert_id uuid, p_actor_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.publish_passport_with_audit(p_passport_id uuid, p_actor_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_passport_with_audit(p_passport_id uuid, p_actor_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.record_quality_check_with_audit(p_lot_id uuid, p_check_type text, p_result text, p_internal_notes text, p_actor_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_quality_check_with_audit(p_lot_id uuid, p_check_type text, p_result text, p_internal_notes text, p_actor_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.register_document_upload_with_audit(p_lot_id uuid, p_product_id uuid, p_storage_path text, p_original_filename text, p_mime_type text, p_byte_size bigint, p_classification text, p_title text, p_description text, p_actor_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_document_upload_with_audit(p_lot_id uuid, p_product_id uuid, p_storage_path text, p_original_filename text, p_mime_type text, p_byte_size bigint, p_classification text, p_title text, p_description text, p_actor_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.release_lot_with_audit(p_lot_id uuid, p_actor_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_lot_with_audit(p_lot_id uuid, p_actor_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.review_quality_check_with_audit(p_check_id uuid, p_actor_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_quality_check_with_audit(p_check_id uuid, p_actor_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.revoke_passport_with_audit(p_passport_id uuid, p_actor_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_passport_with_audit(p_passport_id uuid, p_actor_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.rotate_passport_token_with_audit(p_passport_id uuid, p_qr_token_hash text, p_actor_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_passport_token_with_audit(p_passport_id uuid, p_qr_token_hash text, p_actor_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.transition_lot_with_audit(p_lot_id uuid, p_new_status text, p_reason text, p_actor_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_lot_with_audit(p_lot_id uuid, p_new_status text, p_reason text, p_actor_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.update_incident_with_audit(p_incident_id uuid, p_status text, p_root_cause text, p_corrective_actions text, p_actor_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_incident_with_audit(p_incident_id uuid, p_status text, p_root_cause text, p_corrective_actions text, p_actor_id uuid) TO service_role;
