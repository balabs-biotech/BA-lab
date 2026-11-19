# Security Policy

## Scope

This repository contains the BA Labs Culture Tracker, Supabase database migrations and Edge Function sources, ESP32 firmware, and hardware/biotechnology documentation.

## Reporting a vulnerability

**Do not publish exploit details, credentials, personal data, or production identifiers in a public issue.**

1. If GitHub's **Private vulnerability reporting** feature is enabled for this repository, use the repository's **Security → Advisories → Report a vulnerability** workflow.
2. If that workflow is unavailable, contact the repository maintainers privately through their GitHub account and request a secure channel before sending technical details.
3. Include the affected component and version/commit, impact, minimal reproduction steps, and any suggested mitigation. Redact tokens, personal data, and customer data.

Please do not test against other users' data or production systems without explicit authorization.

## Security design notes

- Browser-side Supabase publishable keys are public identifiers, not secrets. Authorization must be enforced by database grants, RLS policies, and server-side function checks.
- Never commit Supabase service-role/secret keys, Notion integration tokens, device credentials, or private user data.
- Tenant-scoped RPCs must reject cross-organization access.
- IoT ingestion endpoints must validate device credentials and measurement payloads.
- Changes to authentication, authorization, migrations, or Edge Functions should include regression tests.

## Verification limits

A passing CI run checks only the tests and scans defined by the workflow. It is not a guarantee that the application, production configuration, or physical hardware is secure. Production settings and deployed Edge Function versions must be checked independently.
