/* BA Labs Biological Context Adapter v0.1.0
 * Maps an already-authorized BAL-Core snapshot into explicit interpreter context.
 * It performs no database access, tenant lookup, inference or persistence.
 */
(function (root) {
  "use strict";

  const VERSION = "0.1.0";

  function nonEmpty(value) {
    return typeof value === "string" && value.trim().length > 0;
  }

  function invalid(reason) {
    return Object.freeze({
      status: "invalid_context",
      reason,
      context: null,
      evidence: Object.freeze({}),
      missing_fields: Object.freeze([]),
    });
  }

  function build(snapshot) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      return Object.freeze({
        status: "insufficient_context",
        reason: "snapshot_missing",
        context: null,
        evidence: Object.freeze({}),
        missing_fields: Object.freeze(["culture"]),
      });
    }

    const organizationId = snapshot.organization_id;
    const culture = snapshot.culture;
    if (!nonEmpty(organizationId) || !culture || typeof culture !== "object") {
      return Object.freeze({
        status: "insufficient_context",
        reason: "organization_or_culture_missing",
        context: null,
        evidence: Object.freeze({}),
        missing_fields: Object.freeze(["organization_id", "culture"]),
      });
    }
    if (culture.organization_id !== organizationId) return invalid("culture_tenant_mismatch");
    if (!nonEmpty(culture.id)) return invalid("culture_id_missing");

    const context = { culture_id: culture.id };
    const evidence = {
      organization_id: organizationId,
      culture_id: culture.id,
      material_id: nonEmpty(culture.material_id) ? culture.material_id : null,
      environment_id: nonEmpty(culture.environment_id) ? culture.environment_id : null,
      organism_scientific_name: null,
      taxonomy_id: null,
      source: "BAL-Core authorized snapshot",
    };
    const missing = [];

    let material = snapshot.material ?? null;
    if (nonEmpty(culture.material_id)) {
      if (!material) {
        missing.push("material");
      } else {
        if (material.organization_id !== organizationId) return invalid("material_tenant_mismatch");
        if (material.id !== culture.material_id) return invalid("material_culture_link_mismatch");
        if (material.strain_id !== null && material.strain_id !== undefined) {
          if (!nonEmpty(material.strain_id)) return invalid("material_strain_reference_invalid");
          const strain = snapshot.strain ?? null;
          if (!strain) {
            missing.push("strain");
          } else {
            if (strain.organization_id !== organizationId) return invalid("strain_tenant_mismatch");
            if (strain.id !== material.strain_id) return invalid("strain_material_link_mismatch");
            if (!nonEmpty(strain.strain_code)) return invalid("strain_code_missing");
            context.strain_id = strain.id;
            context.strain_code = strain.strain_code;

            const organism = snapshot.organism ?? null;
            if (!organism) {
              missing.push("organism");
            } else {
              if (organism.id !== strain.organism_id) return invalid("organism_strain_link_mismatch");
              if (nonEmpty(organism.taxonomy_id)) {
                context.taxon_code = organism.taxonomy_id;
                evidence.taxonomy_id = organism.taxonomy_id;
              }
              if (nonEmpty(organism.scientific_name)) {
                evidence.organism_scientific_name = organism.scientific_name;
              }
            }
          }
        }
      }
    } else {
      missing.push("material_reference");
    }

    if (nonEmpty(culture.environment_id)) {
      const environment = snapshot.environment ?? null;
      if (!environment) {
        missing.push("environment");
      } else {
        if (environment.organization_id !== organizationId) return invalid("environment_tenant_mismatch");
        if (environment.id !== culture.environment_id) return invalid("environment_culture_link_mismatch");
        context.environment_id = environment.id;
      }
    }

    // Growth stage and medium are deliberately not inferred from free-text notes,
    // protocol names, timestamps or generic metadata.
    missing.push("growth_stage", "medium_code");

    const frozenContext = Object.freeze({ ...context });
    const frozenEvidence = Object.freeze({ ...evidence });
    const frozenMissing = Object.freeze([...new Set(missing)]);
    return Object.freeze({
      status: frozenMissing.length ? "partial_context" : "complete_context",
      reason: frozenMissing.length ? "some_biological_context_not_structured" : "all_supported_context_present",
      context: frozenContext,
      evidence: frozenEvidence,
      missing_fields: frozenMissing,
    });
  }

  root.BALabsBiologicalContextAdapter = Object.freeze({ version: VERSION, build });
})(typeof globalThis !== "undefined" ? globalThis : window);
