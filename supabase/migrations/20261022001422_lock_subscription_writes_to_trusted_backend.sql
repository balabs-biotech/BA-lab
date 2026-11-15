-- Subscription state is authoritative for access and entitlements.
-- Authenticated clients may read their organization's subscription, but must not self-assign a plan or alter status/dates/metadata.
-- Trusted server-side code using the service_role key bypasses RLS and remains responsible for writes.
DROP POLICY IF EXISTS organization_subscriptions_insert ON public.organization_subscriptions;
DROP POLICY IF EXISTS organization_subscriptions_update ON public.organization_subscriptions;
DROP POLICY IF EXISTS organization_subscriptions_delete ON public.organization_subscriptions;
