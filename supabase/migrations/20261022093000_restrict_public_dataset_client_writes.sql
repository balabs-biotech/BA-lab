-- Explicitly remove client write grants from the public dataset catalogue.
-- RLS is still required, but privileges should also express the intended contract.
revoke insert, update, delete, truncate, references, trigger
  on table public.commons_datasets from anon, authenticated;
grant select on table public.commons_datasets to anon, authenticated;
grant all on table public.commons_datasets to service_role;

revoke insert, update, delete, truncate, references, trigger
  on table public.public_dataset_records from anon, authenticated;
grant select on table public.public_dataset_records to anon, authenticated;
grant all on table public.public_dataset_records to service_role;
