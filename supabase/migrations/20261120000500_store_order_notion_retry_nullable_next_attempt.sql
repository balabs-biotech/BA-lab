-- Synced and exhausted requests clear their next retry timestamp.
alter table public.store_orders
  alter column notion_sync_next_attempt_at drop not null;
