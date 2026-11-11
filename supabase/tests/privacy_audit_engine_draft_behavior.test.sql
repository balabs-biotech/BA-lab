-- Behavioral integration tests for the uninstalled Privacy & Audit Engine draft.
-- Runs only against the disposable PostgreSQL 17 CI database, inside a rollback transaction.
begin;

do $$
declare
  bootstrap_user uuid := '11111111-1111-4111-8111-111111111111';
  signup_user uuid := '22222222-2222-4222-8222-222222222222';
  start_at timestamptz := clock_timestamp() + interval '3 seconds';
  terms_v1 uuid;
  privacy_v1 uuid;
  terms_v2 uuid;
  result jsonb;
  event_count integer;
  active_count integer;
begin
  -- Create the actor before publishing versions; bypass only the new signup
  -- trigger for this fixture account, then restore it immediately.
  alter table auth.users disable trigger auth_user_signup_legal_acts;
  insert into auth.users(id, raw_user_meta_data)
  values (bootstrap_user, '{}'::jsonb);
  alter table auth.users enable trigger auth_user_signup_legal_acts;

  terms_v1 := public.publish_legal_document_version(
    'terms','test-terms-v1',repeat('a',64),'legal/terms.html',start_at,bootstrap_user
  );
  privacy_v1 := public.publish_legal_document_version(
    'privacy_notice','test-privacy-v1',repeat('b',64),'legal/privacy.html',start_at,bootstrap_user
  );

  -- Both mandatory documents must be effective before Auth accepts the user.
  perform pg_sleep(3.1);

  result := public.hook_validate_signup_legal_versions(jsonb_build_object(
    'user', jsonb_build_object('user_metadata', jsonb_build_object(
      'legal_terms_version','test-terms-v1',
      'legal_privacy_version','test-privacy-v1'
    ))
  ));
  if result <> '{}'::jsonb then
    raise exception 'expected_signup_hook_allow_result: %', result;
  end if;

  result := public.hook_validate_signup_legal_versions(jsonb_build_object(
    'user', jsonb_build_object('user_metadata', jsonb_build_object(
      'legal_terms_version','unknown',
      'legal_privacy_version','test-privacy-v1'
    ))
  ));
  if result -> 'error' is null then
    raise exception 'expected_signup_hook_rejection_for_unknown_version';
  end if;

  insert into auth.users(id, raw_user_meta_data)
  values (signup_user, jsonb_build_object(
    'legal_terms_version','test-terms-v1',
    'legal_privacy_version','test-privacy-v1'
  ));

  select count(*) into event_count
  from private.legal_consent_events
  where subject_user_id = signup_user;
  if event_count <> 2 then
    raise exception 'signup_trigger_expected_two_ledger_events_got_%', event_count;
  end if;

  if not exists (
    select 1 from private.legal_consent_events
    where subject_user_id = signup_user
      and document_version_id = terms_v1
      and action = 'accepted' and purpose = 'terms_acceptance'
  ) then
    raise exception 'terms_acceptance_event_missing';
  end if;

  if not exists (
    select 1 from private.legal_consent_events
    where subject_user_id = signup_user
      and document_version_id = privacy_v1
      and action = 'acknowledged' and purpose = 'privacy_notice_acknowledgement'
  ) then
    raise exception 'privacy_acknowledgement_event_missing';
  end if;

  -- Publish a future successor. The current version is retired at the exact
  -- effective instant of its replacement.
  terms_v2 := public.publish_legal_document_version(
    'terms','test-terms-v2',repeat('c',64),'legal/terms.html',
    start_at + interval '10 minutes',bootstrap_user
  );

  -- A second publication inserted before the scheduled retirement would
  -- overlap with the already-published validity interval and must be rejected.
  begin
    perform public.publish_legal_document_version(
      'terms','test-terms-conflict',repeat('d',64),'legal/terms.html',
      start_at + interval '5 minutes',bootstrap_user
    );
    raise exception 'expected_validity_overlap_conflict';
  exception when raise_exception then
    if sqlerrm <> 'legal_document_validity_overlap_conflict' then
      raise;
    end if;
  end;

  select count(*) into active_count
  from private.legal_document_versions
  where document_type = 'terms'
    and effective_at <= start_at + interval '10 minutes'
    and (retired_at is null or retired_at > start_at + interval '10 minutes');
  if active_count <> 1 then
    raise exception 'expected_exactly_one_active_terms_version_at_successor_boundary_got_%', active_count;
  end if;

  -- Mandatory legal documents cannot be retired without an effective successor.
  begin
    perform public.retire_legal_document_version(privacy_v1, start_at + interval '20 minutes');
    raise exception 'expected_successor_required_for_privacy_notice';
  exception when raise_exception then
    if sqlerrm <> 'legal_document_successor_required' then
      raise;
    end if;
  end;

  -- Published content and consent events are immutable.
  begin
    update private.legal_document_versions
    set content_sha256 = repeat('e',64)
    where id = terms_v1;
    raise exception 'expected_published_document_immutability';
  exception when raise_exception then
    if sqlerrm <> 'published_legal_document_version_immutable' then
      raise;
    end if;
  end;

  begin
    update private.legal_consent_events
    set request_id = 'tamper'
    where subject_user_id = signup_user;
    raise exception 'expected_append_only_consent_ledger';
  exception when raise_exception then
    if sqlerrm <> 'append_only_record_immutable' then
      raise;
    end if;
  end;
end
$$;

rollback;
