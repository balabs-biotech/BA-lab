-- Subscription state is authoritative for access/entitlements.
-- Authenticated clients may read their organization's subscription, but must not
-- self-assign a plan or alter status/dates/metadata. Trusted server-side code
-- using the service_role key bypasses RLS and remains responsible for writes.
--
-- Some installations do not provision subscription tables until billing is
-- enabled. PostgreSQL still resolves a relation for DROP POLICY IF EXISTS, so
-- guard the policy cleanup when the optional table is absent.
do $$
begin
  if to_regclass('public.organization_subscriptions') is not null then
    drop policy if exists organization_subscriptions_insert on public.organization_subscriptions;
    drop policy if exists organization_subscriptions_update on public.organization_subscriptions;
    drop policy if exists organization_subscriptions_delete on public.organization_subscriptions;
  end if;
end
$$;
