-- Prevent newly created public RPCs from inheriting broad client EXECUTE grants.
-- Existing functions are unchanged; intended API functions must receive explicit grants.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
