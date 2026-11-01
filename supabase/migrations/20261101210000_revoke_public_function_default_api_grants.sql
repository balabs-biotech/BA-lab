-- PostgreSQL grants EXECUTE to PUBLIC on new functions unless the global default is revoked.
-- Remove that inherited grant for functions created by postgres, then remove
-- explicit API-role defaults in public. Existing functions are unchanged.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
