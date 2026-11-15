# Supabase migrations — reconciliation report

**Project:** `BALabs`  
**Compared:** 15 November 2026  
**Method:** read-only comparison of the Supabase migration history with filenames in `supabase/migrations/` on branch `architecture/cultureops-intelligence-2026-11-15`.

## Result

| Measure | Count |
|---|---:|
| Applied migrations registered in Supabase | 92 |
| SQL migration files tracked in Git | 57 |
| Exact version + name matches | 43 |
| Applied remote migrations without an exact Git filename | 49 |
| Git migration files with no exact remote version + name | 14 |

The histories are **not synchronized**. A subset of local files appears to represent similarly named changes with different version identifiers. A name match is not proof that the SQL bodies are identical or that the migration has the same deployment semantics.

## Applied migrations missing from Git under their exact remote identifiers

- `20261022043824_link_iot_measurements_to_environment.sql`
- `20261022043901_add_atomic_iot_ingestion_rpc.sql`
- `20261022043951_add_controlled_public_dataset_exports.sql`
- `20261022044035_restrict_public_dataset_client_writes.sql`
- `20261023012845_add_mycology_culture_formats.sql`
- `20261023020711_enable_pg_net_for_secure_scheduled_imports.sql`
- `20261023023224_schedule_secure_nasa_power_daily_import.sql`
- `20261023152559_version_nasa_power_cron_secret_verifier.sql`
- `20261023213359_index_plant_cultures_location_environment_fks.sql`
- `20261030202039_allow_plant_culture_event_anchor.sql`
- `20261030202048_add_atomic_manual_measurement_observation_rpc.sql`
- `20261030202058_add_atomic_batch_harvest_rpc.sql`
- `20261030202102_harden_sensitive_rpc_search_paths.sql`
- `20261030202110_reject_iot_message_id_payload_mismatch.sql`
- `20261030202113_lock_audit_table_mutations.sql`
- `20261030202118_enforce_role_aware_tenant_writes.sql`
- `20261111032007_create_biological_profile_registries.sql`
- `20261111032018_harden_profile_registry_immutability.sql`
- `20261111032035_restrict_registry_table_grants.sql`
- `20261111034000_align_profile_versions_with_engine_contract.sql`
- `20261111042419_enforce_profile_resolution_windows.sql`
- `20261111042631_allow_profile_validity_closure_on_retirement.sql`
- `20261111043003_revoke_anonymous_profile_registry_access.sql`
- `20261115001642_engine_execution_queue_v1.sql`
- `20261115001714_engine_execution_queue_v1_hardening.sql`
- `20261115001743_engine_execution_queue_claim_ambiguity_fix.sql`
- `20261115001803_engine_execution_queue_claim_ambiguity_fix_v2.sql`
- `20261115002017_versioned_engine_registry_v1.sql`
- `20261115002030_engine_queue_policy_and_fk_index_tuning.sql`
- `20261115002039_engine_job_enqueue_rpc_v1.sql`
- `20261115002058_register_nasa_power_environment_engine_v1.sql`
- `20261115002104_register_sentinel2_ndvi_preview_engine_v1.sql`
- `20261115002757_engine_worker_cron_secret_verifier_v1.sql`
- `20261115003440_biological_strain_profiles_v1.sql`
- `20261115003610_biological_strain_profiles_rls_policy_split.sql`
- `20261115003720_link_biological_profiles_to_strain_registry.sql`
- `20261115003741_biological_parameter_references_v1.sql`
- `20261115004252_biological_reference_semantics_and_evidence_links_v1.sql`
- `20261115004344_remove_duplicate_profile_evidence_index_v1.sql`
- `20261115004607_substrate_composition_and_pasteurization_traceability_v1.sql`
- `20261115004625_fix_composite_substrate_foreign_key_delete_actions_v1.sql`
- `20261115010036_domain_variable_catalog_v1.sql`
- `20261115010529_domain_variable_catalog_fk_index_v1.sql`
- `20261115010710_derived_metric_results_and_input_provenance_v1.sql`
- `20261115010729_derived_metric_provenance_fk_indexes_v1.sql`
- `20261115011154_extend_formula_registry_for_generation_and_mycology_kinetics_v1.sql`
- `20261115011237_register_mycelial_diameter_rate_metric_v1.sql`
- `20261115011317_derived_formula_registry_fk_indexes_v1.sql`
- `20261115012405_lab_od600_log_linear_regression_v1.sql`

## Git migration filenames without an exact match in the active remote history

- `20261022070000_link_iot_measurements_to_environment.sql`
- `20261022080000_add_atomic_iot_ingestion_rpc.sql`
- `20261022090000_add_controlled_public_dataset_exports.sql`
- `20261022093000_restrict_public_dataset_client_writes.sql`
- `20261023012000_add_mycology_culture_formats.sql`
- `20261023020000_version_nasa_power_cron_secret_verifier.sql`
- `20261025103000_allow_plant_culture_event_anchor.sql`
- `20261025110000_add_atomic_manual_measurement_observation_rpc.sql`
- `20261025120000_add_atomic_batch_harvest_rpc.sql`
- `20261025130000_harden_sensitive_rpc_search_paths.sql`
- `20261025130100_reject_iot_message_id_payload_mismatch.sql`
- `20261025140000_lock_audit_table_mutations.sql`
- `20261029100000_enforce_role_aware_tenant_writes.sql`
- `20261111160000_add_bal_json_atomic_ingestion.sql`

## Recovery rules

1. Do not rename local migration files to remote timestamps based only on similar names.
2. Do not generate placeholder SQL files for the missing remote identifiers.
3. Retrieve the original SQL from the authoritative source (original development environment, secure backup, or verified deployment artifact).
4. Compare each recovered SQL body with the current remote schema and migration intent.
5. Build a separate clean bootstrap/replay path only after the full migration set and required extensions/auth roles are known.
6. Keep the active production migration history untouched during recovery.
7. Validate replay in isolated PostgreSQL/Supabase before proposing any production action.

## Immediate consequence

The queue, engine registry, biological profiles, domain variable catalogue and derived metric migrations are among the missing exact source files. Therefore the new engine queue schema cannot yet be replayed from this repository alone. The live RPC contracts have been inspected read-only and documented in `docs/architecture/engine-execution-contract-audit.md`; that inspection is not a substitute for versioned migration source.
