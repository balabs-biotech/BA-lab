-- Privacy & Audit Engine contract.
-- Read-only catalog assertions: this test intentionally fails until the migration is installed.
do $$
declare
  target_table text;
  required_column text;
  missing_columns text[];
  has_append_only_guard boolean;
  role_name text;
  privilege_name text;
begin
  foreach target_table in array array[
    'legal_document_versions',
    'legal_consent_events',
    'personal_data_operation_events'
  ] loop
    if to_regclass(format('private.%I', target_table)) is null then
      raise exception 'privacy_audit_table_missing: private.%', target_table;
    end if;

    if not (
      select c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'private' and c.relname = target_table
    ) then
      raise exception 'privacy_audit_rls_disabled: private.%', target_table;
    end if;

    foreach role_name in array array['anon','authenticated'] loop
      foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
        if has_table_privilege(role_name, format('private.%I', target_table), privilege_name) then
          raise exception 'privacy_audit_client_grant: role %, privilege %, table private.%',
            role_name, privilege_name, target_table;
        end if;
      end loop;
    end loop;

    if target_table in ('legal_consent_events','personal_data_operation_events') then
      select exists (
        select 1
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'private'
          and c.relname = target_table
          and not t.tgisinternal
          and (t.tgtype & 2) = 2
          and ((t.tgtype & 8) = 8 or (t.tgtype & 16) = 16)
      ) into has_append_only_guard;

      if not has_append_only_guard then
        raise exception 'privacy_audit_append_only_guard_missing: private.%', target_table;
      end if;
    end if;
  end loop;

  if has_table_privilege('service_role', 'private.legal_consent_events', 'TRUNCATE')
     or has_table_privilege('service_role', 'private.personal_data_operation_events', 'TRUNCATE') then
    raise exception 'privacy_audit_service_role_truncate_grant_forbidden';
  end if;

  -- The document ledger must pin a version to the exact published content.
  foreach required_column in array array['document_type','version','content_sha256','effective_at'] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema='private'
        and table_name='legal_document_versions'
        and column_name=required_column
    ) then
      raise exception 'legal_document_version_column_missing: %', required_column;
    end if;
  end loop;

  -- Consent acts are separate immutable events and reference a document version.
  foreach required_column in array array['subject_user_id','actor_user_id','document_version_id','action','purpose','occurred_at','capture_channel'] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema='private'
        and table_name='legal_consent_events'
        and column_name=required_column
    ) then
      raise exception 'legal_consent_event_column_missing: %', required_column;
    end if;
  end loop;

  -- Operation journal records metadata about an operation, never payload values.
  foreach required_column in array array['actor_user_id','operation','data_categories','purpose_code','resource_ref','occurred_at','request_id','source_component','outcome'] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema='private'
        and table_name='personal_data_operation_events'
        and column_name=required_column
    ) then
      raise exception 'personal_data_operation_column_missing: %', required_column;
    end if;
  end loop;

  -- Signup capture must run on auth.users INSERT, before any email-confirmation
  -- session exists. It must be narrowly privileged and unavailable as an RPC.
  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth'
      and c.relname = 'users'
      and t.tgname = 'auth_user_signup_legal_acts'
      and not t.tgisinternal
      and (t.tgtype & 4) = 4
    ) then
    raise exception 'privacy_audit_signup_capture_trigger_missing';
  end if;

  if to_regprocedure('private.capture_signup_legal_acts()') is null then
    raise exception 'privacy_audit_signup_capture_function_missing';
  end if;

  if has_function_privilege('anon', 'private.capture_signup_legal_acts()', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.capture_signup_legal_acts()', 'EXECUTE') then
    raise exception 'privacy_audit_signup_capture_function_client_executable';
  end if;

  if not has_table_privilege('service_role', 'private.legal_consent_events', 'INSERT')
     or not has_table_privilege('service_role', 'private.legal_consent_events', 'SELECT') then
    raise exception 'privacy_audit_service_role_consent_ledger_privileges_missing';
  end if;


  -- Before User Created hook must be executable by Auth only.
  if to_regprocedure('public.hook_validate_signup_legal_versions(jsonb)') is null then
    raise exception 'privacy_audit_signup_validation_hook_missing';
  end if;

  if has_function_privilege('anon', 'public.hook_validate_signup_legal_versions(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.hook_validate_signup_legal_versions(jsonb)', 'EXECUTE') then
    raise exception 'privacy_audit_signup_validation_hook_client_executable';
  end if;

  if not has_function_privilege('supabase_auth_admin', 'public.hook_validate_signup_legal_versions(jsonb)', 'EXECUTE') then
    raise exception 'privacy_audit_signup_validation_hook_auth_role_not_granted';
  end if;


  if to_regclass('private.platform_administrators') is null then
    raise exception 'privacy_audit_platform_administrators_table_missing';
  end if;

  if has_table_privilege('anon', 'private.platform_administrators', 'SELECT')
     or has_table_privilege('authenticated', 'private.platform_administrators', 'SELECT')
     or has_table_privilege('service_role', 'private.platform_administrators', 'SELECT') then
    raise exception 'privacy_audit_platform_admin_table_must_not_be_directly_readable';
  end if;

  foreach required_column in array array['user_id','granted_at','granted_by','reason'] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema='private'
        and table_name='platform_administrators'
        and column_name=required_column
    ) then
      raise exception 'privacy_audit_platform_admin_column_missing: %', required_column;
    end if;
  end loop;

  if to_regprocedure('public.is_platform_administrator(uuid)') is null
     or to_regprocedure('public.list_legal_document_versions()') is null
     or to_regprocedure('public.publish_legal_document_version(text,text,text,text,timestamp with time zone,uuid)') is null
     or to_regprocedure('public.retire_legal_document_version(uuid,timestamp with time zone)') is null then
    raise exception 'privacy_audit_document_registry_rpc_missing';
  end if;

  foreach role_name in array array['anon','authenticated'] loop
    if has_function_privilege(role_name, 'public.is_platform_administrator(uuid)', 'EXECUTE')
       or has_function_privilege(role_name, 'public.list_legal_document_versions()', 'EXECUTE')
       or has_function_privilege(role_name, 'public.publish_legal_document_version(text,text,text,text,timestamp with time zone,uuid)', 'EXECUTE')
       or has_function_privilege(role_name, 'public.retire_legal_document_version(uuid,timestamp with time zone)', 'EXECUTE') then
      raise exception 'privacy_audit_registry_rpc_client_executable: %', role_name;
    end if;
  end loop;

  if not has_function_privilege('service_role', 'public.is_platform_administrator(uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.list_legal_document_versions()', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.publish_legal_document_version(text,text,text,text,timestamp with time zone,uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.retire_legal_document_version(uuid,timestamp with time zone)', 'EXECUTE') then
    raise exception 'privacy_audit_registry_rpc_service_role_grants_missing';
  end if;

end
$;
