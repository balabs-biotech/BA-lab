/* BA Labs Biological Context Loader v0.1.0
 * Performs organization-scoped Supabase reads, then delegates mapping to the pure adapter.
 * No service-role access, writes, implicit tenant selection or scientific inference.
 */
(function (root) {
  "use strict";

  const VERSION = "0.1.0";

  async function one(client, table, columns, filters) {
    let query = client.from(table).select(columns);
    for (const [column, value] of filters) query = query.eq(column, value);
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error("biological_context_query_failed:" + table + ":" + (error.code || "unknown"));
    return data ?? null;
  }

  async function load(input) {
    if (!input || !input.client || typeof input.client.from !== "function" ||
        !input.adapter || typeof input.adapter.build !== "function" ||
        typeof input.organizationId !== "string" || !input.organizationId.trim() ||
        typeof input.cultureId !== "string" || !input.cultureId.trim()) {
      return Object.freeze({
        status: "insufficient_context",
        reason: "loader_input_incomplete",
        context: null,
        evidence: Object.freeze({}),
        missing_fields: Object.freeze(["client", "adapter", "organization_id", "culture_id"]),
      });
    }

    const { client, adapter, organizationId, cultureId } = input;
    const culture = await one(client, "cultures",
      "organization_id,id,material_id,environment_id",
      [["organization_id", organizationId], ["id", cultureId]]);
    if (!culture) {
      return Object.freeze({
        status: "insufficient_context",
        reason: "culture_not_found_in_organization",
        context: null,
        evidence: Object.freeze({ organization_id: organizationId, culture_id: cultureId }),
        missing_fields: Object.freeze(["culture"]),
      });
    }

    let material = null;
    let strain = null;
    let organism = null;
    let environment = null;

    if (typeof culture.material_id === "string" && culture.material_id) {
      material = await one(client, "materials",
        "organization_id,id,strain_id",
        [["organization_id", organizationId], ["id", culture.material_id]]);
      if (material && typeof material.strain_id === "string" && material.strain_id) {
        strain = await one(client, "strains",
          "organization_id,id,strain_code,organism_id",
          [["organization_id", organizationId], ["id", material.strain_id]]);
        if (strain && typeof strain.organism_id === "string" && strain.organism_id) {
          organism = await one(client, "organisms",
            "id,taxonomy_id,scientific_name",
            [["id", strain.organism_id]]);
        }
      }
    }

    if (typeof culture.environment_id === "string" && culture.environment_id) {
      environment = await one(client, "environments",
        "organization_id,id",
        [["organization_id", organizationId], ["id", culture.environment_id]]);
    }

    return adapter.build({
      organization_id: organizationId,
      culture,
      material,
      strain,
      organism,
      environment,
    });
  }

  root.BALabsBiologicalContextLoader = Object.freeze({ version: VERSION, load });
})(typeof globalThis !== "undefined" ? globalThis : window);
