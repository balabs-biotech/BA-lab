# B.A. LAB — Integrated Agritech & Environmental Biotechnology Platform

![Status](https://img.shields.io/badge/Status-Active_R%26D-brightgreen)
![Focus](https://img.shields.io/badge/Focus-Biotech_%26_Frugal_Engineering-blue)
![Location](https://img.shields.io/badge/Location-S%C3%A9tif%2C_Algeria-orange)
![License](https://img.shields.io/badge/License-Mixed_(see_LICENSE)-lightgrey)

## Overview

**B.A. LAB** is an applied biotechnology and environmental engineering project based in Sétif, Algeria. This repository uses B.A. LAB as a project name and does not assert that a legal entity has been registered under that name. Its mission is to deploy an integrated bio-economy platform for input sovereignty, automated environmental control and regeneration of degraded soils, combining applied microbiology (PGPR, ligninolytic fungi, seaweed hydrolysates) with frugal engineering and IoT automation.

| Pillar | Core technologies | Applications |
| :--- | :--- | :--- |
| **1. Bio-inputs & biostimulants** | Seaweed hydrolysates, PGPR (*Bacillus* spp.), *Trichoderma* spp., biochar | Soil regeneration, biocontrol |
| **2. Modular myciculture** | *Pleurotus*, *Hericium*, *Agrocybe*, *Cordyceps* | Waste upcycling, high-value biomass |
| **3. In vitro micropropagation** | Temporary Immersion Systems, Twin-Bottle bioreactors | Low-cost multiplication of resilient varieties |
| **4. Frugal hardware & IoT** | Laminar-flow hoods, PEHD biofermenters, ESP32 climate automation | Local manufacturing, water optimisation, automation |

## Where things live (no duplicates)

Each kind of content has **one** source of truth. This repository is not a copy of the other two.

| Content | Source of truth | In this repository? |
| :--- | :--- | :--- |
| Live data, authentication, access rules and deployed Edge Functions | **Supabase** (project `BALabs`) | Runtime lives in Supabase; versioned migrations, tests and function source are maintained under `supabase/` |
| Experiments, strains, reference protocols, field notebook | **Notion** | **No**, except technical sheets needed to build or run equipment |
| Firmware, IoT configuration, hardware plans, technical SOPs, tests, CI | **GitHub** (this repository) | **Yes** |
| Batch Tracker web interface (`batch-tracker/`) | This repository | **Yes** — see [`batch-tracker/README.md`](batch-tracker/README.md) |

## Repository map

```text
.
├── batch-tracker/    # Batch Tracker web UI (static page; talks to Supabase)
├── firmware/         # ESP32 firmware: single PlatformIO project, tests, safety model
├── hardware/         # Equipment plans (HW-ENG-001..003) — concepts, NOT qualified
├── biotech-sops/     # SOPs: bacteria isolation, mycology, micropropagation
├── bio-inputs/       # Technical sheets for bio-input formulations
├── 01_R-and-D_Lab/   # R&D protocol notes (to be reconciled with Notion)
├── docs/             # Facility layout and infrastructure notes
├── assets/           # Images and visual assets
├── LICENSE           # Licence map by directory
├── LICENSES/         # Licence texts
└── index.html        # Public landing page: choose Agronomy, Mycology or Laboratory
```

## Batch Tracker entry

Open the repository's published site at its root to choose an interface before entering the tracker. The three supported entry links are:

- Agronomy: `batch-tracker/?domain=agronomy`
- Mycology: `batch-tracker/?domain=mycology`
- Laboratory: `batch-tracker/?domain=laboratory`

Opening `batch-tracker/` without a supported `domain` query parameter redirects to the landing page. The CI regression check verifies that these links and the redirect guard stay aligned.

## Safety and validation status

- **Hardware sheets are design concepts**, not certified or qualified designs. Each carries a status banner. In particular: no ISO class is claimed for the laminar-flow hood, the Kon-Tiki hot-quench step is suspended, and the PEHD biofermenter must never be pressurised.
- **Firmware has not been tested on real hardware.** It passes host-side logic tests only; relay polarity and all thresholds must be verified on the actual equipment. See [`firmware/README.md`](firmware/README.md).
- **SOPs are working drafts** until each one carries an explicit validation status. Values are internal targets, not validated results.

## Licensing

Mixed licensing by directory — see [`LICENSE`](LICENSE). Summary: firmware MIT, hardware CERN-OHL-P-2.0, biotechnology documents and the Batch Tracker all rights reserved.

© 2026 B.A. LAB project — Sétif, Algeria. See `LICENSE` for directory-specific rights; the project name is not a statement of legal incorporation.
