-- Protège les colonnes notion_* de public.cultures.
--
-- Les membres authentifiés peuvent modifier leurs cultures (RLS inchangée) mais
-- ne doivent pas pouvoir écrire l'état de synchronisation Notion : seule la
-- fonction Edge sync-culture-to-notion (rôle service_role) ou un rôle
-- d'administration le peut. Aucun privilège ni politique n'est modifié.
--
-- Rollback (ne supprime aucune donnée) :
--   drop trigger if exists cultures_protect_notion_cols on public.cultures;
--   drop function if exists private.protect_cultures_notion_cols();

create or replace function private.protect_cultures_notion_cols()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Une culture créée par un utilisateur démarre toujours à l'état initial.
    new.notion_page_id := null;
    new.notion_sync_status := 'pending';
    new.notion_synced_at := null;
    new.notion_sync_error := null;
  elsif new.notion_page_id is distinct from old.notion_page_id
     or new.notion_sync_status is distinct from old.notion_sync_status
     or new.notion_synced_at is distinct from old.notion_synced_at
     or new.notion_sync_error is distinct from old.notion_sync_error then
    raise exception 'notion_* columns are managed by the sync-culture-to-notion function'
      using errcode = '42501';
  end if;

  return new;
end
$$;

drop trigger if exists cultures_protect_notion_cols on public.cultures;
create trigger cultures_protect_notion_cols
  before insert or update on public.cultures
  for each row execute function private.protect_cultures_notion_cols();
