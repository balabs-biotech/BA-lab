-- New storefront requests should enter the Notion sync queue immediately.
-- The previous ten-minute default added unnecessary latency to first delivery.
alter table public.store_orders
  alter column notion_sync_next_attempt_at set default pg_catalog.now();

update public.store_orders
set notion_sync_next_attempt_at = pg_catalog.now(),
    updated_at = pg_catalog.now()
where notion_sync_status = 'pending'
  and notion_sync_attempts = 0
  and notion_sync_next_attempt_at > pg_catalog.now();
