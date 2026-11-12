-- Prevent future public tables created by postgres from inheriting broad API-role grants.
-- Existing tables are unchanged; each exposed table must receive explicit least-privilege grants.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;
