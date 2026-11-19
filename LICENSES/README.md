# Licence texts

| File | Status |
|---|---|
| `MIT.txt` | ✓ Present. Applies to `firmware/`. |
| `CERN-OHL-P-2.0.txt` | ✓ Present. Applies to `hardware/`. |

## Licence status per directory

- **`firmware/`**: MIT (permissive, any use)
- **`hardware/`**: CERN-OHL-P-2.0 (open-hardware; derivatives must disclose source)
- **`batch-tracker/`**: Proprietary, all rights reserved (see root `LICENSE`).
- **Root, `biotech-sops/`, `bio-inputs/`, `docs/`, `01_R-and-D_Lab/`**: Proprietary (B.A. LAB project)

## Batch-tracker licence

The `batch-tracker/` frontend is marked proprietary in the root `LICENSE`; it is not open-source merely because it loads an open-source dependency. Its current browser dependency is pinned to `@supabase/supabase-js@2.118.0` (MIT/Apache-2.0 notices should be verified against the exact upstream release before redistributing a bundled copy).

The browser dependency is served from a CDN and is not bundled into this repository. Keep third-party licence notices with any future bundled or distributed build. Do not add an open-source SPDX identifier to the proprietary application unless the owner intentionally changes its licensing policy.
