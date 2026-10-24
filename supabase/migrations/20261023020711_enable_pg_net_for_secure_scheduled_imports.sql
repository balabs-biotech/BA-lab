-- Enable pg_net for the trusted scheduled NASA POWER importer.
-- The extension lives in Supabase's extensions schema; no credentials are stored here.
create extension if not exists pg_net with schema extensions;
