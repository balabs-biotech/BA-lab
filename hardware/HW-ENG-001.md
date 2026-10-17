# 🛠️ HW-ENG-001: Horizontal HEPA H14 Laminar Flow Hood

* **Document Code:** HW-ENG-001
* **Version:** 1.0
* **Design target:** low-particulate horizontal laminar-flow workstation (aspiration: ISO 14644-1 Class 5 conditions)
* **Status:** 🟠 **CONCEPT / PROTOTYPE — NOT QUALIFIED.** ISO Class 5 is a design aspiration, not a result.
* **Licensing:** CERN Open Hardware Licence Version 2 - Permissive (CERN-OHL-P)
* **Author:** SARL B.A. LAB — Hardware & Engineering Unit

> ⚠️ **Do not claim ISO 5 or validated aseptic use** until an independent qualification is done on the *assembled* unit: HEPA filter and seal integrity scan (aerosol photometer / particle counter), airborne particle count per ISO 14644-1, velocity uniformity and a documented protocol. The checks in section 4 are *commissioning checks*, not a qualification.
> ⚠️ A horizontal laminar-flow hood blows air **towards the operator**. It protects the product, not the user. **Never handle pathogens, biohazardous or sensitising material in it** — that requires a certified biological safety cabinet.
> ⚠️ Airflow, pressure and power figures are pre-sizing values. Confirm them against the real fan curve and filter data sheet.

---

## 📌 1. Technical Overview & Physics

This document details the engineering specifications, dimensioning formulas, assembly protocol, and aeraulic validation for the SARL B.A. LAB laminar flow workstation. The workstation provides a horizontal laminar air stream filtered through a High-Efficiency Particulate Air (HEPA H14) filter, guaranteeing $99.995\%$ filtration efficiency for particles $\ge 0.3\ \mu\text{m}$.

### Aeraulic Sizing Formulas

To guarantee laminar flow and prevent micro-turbulences that pull ambient air into the work zone, face velocity must be maintained at $v = 0.45\ \text{m/s} \pm 20\%$ ($0.36\ \text{m/s} - 0.54\ \text{m/s}$).

The required volumetric airflow rate $Q$ is calculated as:

$$Q = v \cdot A \cdot 3600$$

Where:
* $Q$ = Volumetric airflow rate ($\text{m}^3/\text{h}$)
* $v$ = Target face velocity ($0.45\ \text{m/s}$)
* $A$ = Net surface area of the HEPA filter ($H \cdot W$ in meters)

For a standard filter size of $0.61\ \text{m} \times 0.61\ \text{m}$ ($A = 0.3721\ \text{m}^2$):

$$Q = 0.45 \cdot 0.3721 \cdot 3600 = 602.8\ \text{m}^3/\text{h}$$

To account for static pressure loss ($\Delta P_{\text{total}} = \Delta P_{\text{G4}} + \Delta P_{\text{H14}} \approx 250\ \text{Pa} - 350\ \text{Pa}$), the selected centrifugal blower must deliver $Q_{\text{min}} \ge 650\ \text{m}^3/\text{h}$ at $300\ \text{Pa}$ static pressure.

---

## 🔩 2. Bill of Materials (BOM)

| Component | Technical Specifications | Qty | Function |
| :--- | :--- | :--- | :--- |
| **HEPA Filter** | H14 Grade ($99.995\%$), $610 \times 610 \times 150\ \text{mm}$, Aluminum frame | 1 | Final particulate filtration |
| **Prefilter** | G4 / MERV 8 synthetic panel, $500 \times 500 \times 20\ \text{mm}$ | 1 | Capture coarse particles ($>10\ \mu\text{m}$) |
| **Centrifugal Blower** | $220\text{V AC}$, $180\text{W}$, $\ge 700\ \text{m}^3/\text{h}$ at $300\ \text{Pa}$ | 1 | Primary air pressurization |
| **Plenum Structure** | Marine Plywood $18\text{mm}$ or Aluminum Composite (ACP) | 1 box | Pressurized air chamber |
| **Gaskets & Sealant** | Closed-cell Neoprene foam ($10 \times 5\text{mm}$) + Neutral Silicone | 2 rolls | Air-tight plenum sealing |
| **Differential Gauge** | Magnehelic / U-tube Manometer ($0 - 500\ \text{Pa}$) | 1 | Monitor filter clogging ($\Delta P$) |
| **Sterilization Light** | UV-C Tube $254\text{nm}$ ($18\text{W}$) with **door/shield interlock** | 1 | Optional supplementary surface disinfection. **Not a substitute for cleaning and chemical disinfection.** UV-C injures eyes and skin: operate only when nobody is present and the work area is shielded; never leave it on unattended. |

---

## ⚙️ 3. Assembly Protocol

```text
[ G4 Prefilter ] ──> [ Centrifugal Blower ] ──> [ Sealed Plenum Box ] ──> [ HEPA H14 Filter ] ──> [ Laminar Workzone ]
```

Phase A: Sealed Plenum ConstructionAssemble the outer housing using marine plywood ($18\text{mm}$) or ACP. Secure joints with wood glue and mechanical fasteners.Apply a continuous bead of neutral silicone sealant to every interior joint to eliminate pressurization leaks.Coat internal wooden surfaces with epoxy resin or non-gassing polyurethane enamel to prevent particle shedding.

Phase B: Blower & Vibration DecouplingMount the centrifugal blower on rubber anti-vibration dampeners (Isolators) at the top or back of the plenum box.Connect the blower outlet to the plenum intake using a flexible neoprene duct connector to isolate mechanical resonance.

Phase C: HEPA Filter Seating & ClampingApply a continuous closed-cell neoprene gasket along the mounting rim of the HEPA filter frame.Insert the HEPA H14 filter into the plenum mouth. Do not touch the delicate pleated fiberglass medium.Apply uniform compression using 4 perimeter clamping brackets. Tighten until the gasket is compressed by approximately $30\%$.

📊 4. Commissioning Checks (not a qualification)These are basic commissioning checks. Passing them does **not** establish an ISO class or a sterile-work claim (see the warning at the top). All three must pass before the unit is used even for low-risk clean work:
Test 1: Aeraulic Velocity Grid CalibrationEquipment: Anemometer (Hot-wire or Vane).Procedure: Divide the HEPA face into a $3 \times 3$ grid (9 measurement points). Hold the sensor $10\text{cm}$ away from the face.Acceptance Criteria: Average face velocity must equal $0.45\ \text{m/s} \pm 20\%$. No individual point may deviate by more than $25\%$.
Test 2: Laminar Stream Visualization (Smoke Test)Equipment: Non-contaminating glycol mist generator or incense stick.Procedure: Release smoke $5\text{cm}$ in front of the filter face across the entire area.Acceptance Criteria: Smoke streams must travel horizontally in parallel lines without reverse eddies, back-drafts, or turbulent recirculation zones.
Test 3: Biological Settling Plate ExposureEquipment: 5 Open TSA / PDA Agar Petri dishes.Procedure: Place open plates in the center and 4 corners of the work area. Run the blower for 60 minutes. Incubate plates at $28^\circ\text{C}$ for 72 hours.Acceptance Criteria (internal, indicative only): $0\ \text{CFU}$ across all plates. Zero colonies on five plates is a weak indicator; it does not demonstrate an ISO class or process safety.

📜 Revision & Maintenance LogDifferential Pressure Baseline: Initial $\Delta P_0 = 120\ \text{Pa}$. Replace G4 prefilter when $\Delta P \ge 200\ \text{Pa}$. Replace HEPA H14 filter when $\Delta P \ge 350\ \text{Pa}$.
