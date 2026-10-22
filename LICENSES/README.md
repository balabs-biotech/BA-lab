# Licence texts and status

This repository currently contains material with different licence scopes. The repository is
public today; licence notices do not restrict who can view or clone public source code.

| Path | Declared licence | Status / action |
|---|---|---|
| `firmware/` | MIT | Preserve the MIT notice and confirm each file is eligible for redistribution. |
| `hardware/` | CERN-OHL-P-2.0 | Preserve the official licence text and required notices; review each design before redistribution. |
| `batch-tracker/` | Proprietary, all rights reserved | Application-specific source is intended to be proprietary. Move it to a private repository before relying on access control. |
| `supabase/` | Proprietary, all rights reserved unless a file says otherwise | Treat migrations, Edge Functions and app-specific backend code as private application components during migration. |
| `biotech-sops/`, `bio-inputs/`, `01_R-and-D_Lab/`, `docs/` | Proprietary by default unless a file says otherwise | Review documents individually; publish only an approved subset. |
| Root files, assets, workflows and configuration | Mixed / review required | Check each file for third-party content, internal architecture, deployment coupling and secrets before moving it to a public subset. |

## Batch Tracker application licence

The Batch Tracker application is declared proprietary by the root `LICENSE`. The previous statement
that its licence was “to be confirmed” is superseded by that declaration. Third-party dependencies,
fonts, images and other external components remain subject to their own licences and notices.

A proprietary notice is not access control. While this repository remains public, its source can be
viewed and cloned. The intended target is a private repository for the complete application and
backend, plus a separate public repository containing only an explicitly reviewed allowlist of
IoT and hardware material.

## Third-party compliance

Before any release, generate a dependency licence inventory, preserve required notices, and review
any component whose licence is missing, unclear, or incompatible with the intended distribution.
Do not assume that a repository-wide notice overrides third-party licences.

## Migration rule

Do not create the public IoT repository by copying the full repository and deleting selected files.
Build it from an approved allowlist in a clean repository with a clean history. Public history,
forks and clones cannot be reliably recalled after publication.
