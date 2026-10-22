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

## Notion sync and validation
Supabase remains the operational source of truth. Validate sync and biological lineage with a non-production organization and Notion database. Static CI does not constitute production or mobile-browser validation.

## Batch workflows
Batch creation selects a workflow by batch category: generic biological culture, Trichoderma preparation, Pleurotus grain spawn, harvested mushroom product, biostimulant/biofertilizer, or final formulation. Each workflow retains quality control and release stages. Existing batches render the stages actually stored for that batch, ordered by their saved sequence number. The legacy universal sequence is only a display fallback when a batch has no stage rows.
