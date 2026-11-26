# BA Labs CultureOps

**CultureOps** is the working product name for the BA Labs culture, batch and experimental-data tracker.

CultureOps uses a shared HTML template, CSS and JavaScript engine with three distinct static entry pages. Supabase remains the operational source of truth.

## Workspaces
- Green Tech: `green-tech/` — plant/substrate cultures, greenhouse, DF beds and environmental measurements.
- Mycology: `mycology/` — fungal identity, strains, lineage, generations, morphology, transfers and fruiting.
- Laboratory: `laboratory/` — tissue cultures, agar, liquid cultures, grain inoculation, containers, protocols, measurements and material genealogy.

Each page fixes its workspace at entry and does not show the universe switcher inside the workspace. The root `../index.html` is the universe chooser. The old `batch-tracker/index.html` path redirects to the chooser.

The pages share `workspace.html`, `tracker.css` and `tracker.js`; they do not duplicate the large legacy interface. Batch production is scoped to Laboratory. Mycology uses a restrained terracotta palette, not fluorescent lime.

## Data-scope limitation
This change separates entry pages and scopes visible workflow modules. Existing Supabase tables remain organization-scoped rather than workspace-scoped. This change does **not** add database-level workspace partitioning or reclassify existing records. Do not assume records are isolated by domain until a reviewed schema migration, explicit legacy-record classification, and query/RLS tests are added.

## BAL-JSON interoperability (v1)

The Green Tech, Mycology and Laboratory workspaces expose the same AI-assisted import panel.

1. Sign in to the correct BA Labs organization in CultureOps.
2. Use **Copy CultureOps prompt** (or download the Markdown prompt) and paste it into ChatGPT, Gemini, Claude or another general-purpose LLM together with factual notes.
3. Ask the model for one strict JSON object conforming to `BA-LABS/JSON` v1. The prompt contains the active organization UUID and a workspace-specific context example. Green Tech uses `plant_culture_id`; Mycology and Laboratory use `culture_id` or a valid batch anchor.
4. Paste the JSON response into CultureOps, validate and inspect the preview, then explicitly choose **Import into CultureOps**.
5. Imported records remain raw and unreviewed. Review them in the relevant history before treating them as validated experimental data.

The LLM has no database connection and must not claim to have saved anything. CultureOps checks the contract, active tenant, biological/environmental reference ownership, variable and unit catalogue, and writes through the authenticated, idempotent `bal-json-ingest` Edge Function and PostgreSQL RPC. Reusing a `record_id` with the same payload is idempotent; reusing it with a different payload is rejected.

Published contract resources:
- `schemas/bal-json/v1/record.schema.json`
- `schemas/bal-json/v1/measurement.schema.json`
- `schemas/bal-json/v1/observation.schema.json`

The copyable JSON template is a starting shape, not a substitute for the published JSON Schemas or server validation. The bridge does not automatically integrate an LLM API; the user transfers the prompt and JSON explicitly.

## Notion sync and validation
Supabase remains the operational source of truth. Validate sync and biological lineage with a non-production organization and Notion database. Static CI does not constitute production or mobile-browser validation.

## Batch workflows
Batch creation selects a workflow by batch category: generic biological culture, Trichoderma preparation, Pleurotus grain spawn, harvested mushroom product, biostimulant/biofertilizer, or final formulation. Each workflow retains quality control and release stages. Existing batches render the stages actually stored for that batch, ordered by their saved sequence number. The legacy universal sequence is only a display fallback when a batch has no stage rows.
