# Licence texts

| File | Status |
|---|---|
| `MIT.txt` | ✓ Present. Applies to `firmware/`. |
| `CERN-OHL-P-2.0.txt` | ✓ Present. Applies to `hardware/`. |

## Licence status per directory

- **`firmware/`**: MIT (permissive, any use)
- **`hardware/`**: CERN-OHL-P-2.0 (open-hardware; derivatives must disclose source)
- **`batch-tracker/`**: **Status undefined** — see below.
- **Root, `biotech-sops/`, `bio-inputs/`, `docs/`, `01_R-and-D_Lab/`**: Proprietary (B.A. LAB project)

## Batch-tracker licence: to be confirmed

The `batch-tracker/` frontend uses `supabase-js@^2` and depends on open-source libraries.
Its own licence has not been assigned. This must be decided by the owner before the UI
is published or distributed:

- If the batch-tracker is proprietary (B.A. LAB use only): add a `PROPRIETARY` notice in `batch-tracker/` and tag dependencies with their respective licences.
- If it is to be open-source: assign a SPDX identifier in `batch-tracker/package.json` (e.g. MIT, Apache-2.0, etc.) and document dependencies using a tools like `license-report` or `npm-check-licenses`.
