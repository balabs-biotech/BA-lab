# 🛠️ HW-ENG-002: Flame-Cap Kon-Tiki Pyrolysis Kiln & Biochar Thermo-Chemical Activation

* **Document Code:** HW-ENG-002
* **Version:** 1.0
* **System Target:** Biomass Pyrolysis & Porous Carbon Matrix Production for Terra Preta / PGPR Carrier
* **Licensing:** CERN Open Hardware Licence Version 2 - Permissive (CERN-OHL-P)
* **Author:** B.A. LAB project — Hardware & Soil Regeneration Unit
* **Status:** 🔴 **CONCEPT — NOT VALIDATED. Hot-quench step (old Phase C) SUSPENDED pending a safety review.**

> ⛔ **Never inject water or any organic / nutrient solution onto hot or glowing biochar.** Sudden steam generation can throw scalding material out of the kiln, and organic compounds can ignite. The former "rapid injection at ~600 °C" procedure has been removed from this document.
> ⛔ The hot-zone **quenching manifold** and **drain valve** are on hold: do not build them until the safety review is done.
> ℹ️ Performance figures (surface area, pH, water holding capacity) are targets, **not measurements**. No BALabs measurement exists yet.

---

## 📌 1. Technical Overview & Thermodynamics

This document defines the design specifications, operation, and wet-activation protocol for a deep-cone Flame-Cap Kon-Tiki Pyrolysis Kiln. The kiln converts agricultural residues (prunings, straw, nutshells) into porous biochar (specific surface area **not yet measured**: determine by BET analysis before making any claim) through oxygen-starved high-temperature thermochemical decomposition ($500^\circ\text{C} - 650^\circ\text{C}$).

### Thermodynamic Principle

In a flame-cap (Kon-Tiki) kiln the reactor is open at the top: oxygen is excluded from the bed by the flame layer itself, not by a sealed chamber. The $63^\circ$ conical geometry forms a continuous rising flame curtain over the pyrolyzing bed. This curtain burns all volatile pyrolytic gases ($\text{CO}$, $\text{CH}_4$, tar vapors) as they exit the biomass, consuming incoming oxygen and maintaining an anoxic zone beneath the flame:

$$\text{Biomass} \xrightarrow[\Delta, \text{ No O}_2]{500^\circ\text{C} - 650^\circ\text{C}} \text{Biochar (C)} + \text{Bio-oil (tars)} + \text{Syngas } (\text{CO}, \text{H}_2, \text{CH}_4)$$

~~Hot quenching with an organic/nutrient hydrolysate~~ — **suspended** (see warning above). Nutrient loading ("activation") is only to be done on **fully cooled** biochar, in a separate vessel, by soaking at ambient temperature.

---

## 🔩 2. Bill of Materials (BOM) & Geometry

| Component | Technical Specifications | Qty | Function |
| :--- | :--- | :--- | :--- |
| **Kiln Body** | Structural Carbon Steel plate ($3.0\text{mm}$ thickness), $1200\text{mm}$ top rim diameter, $63^\circ$ cone angle | 1 | Pyrolysis chamber |
| **Drainage Valve** | ⛔ **ON HOLD** — not to be built before the safety review | 0 | Was: hot liquid quench drainage |
| **Rim Ring** | Tubular steel ring ($25\text{mm}$ square tube) welded to top rim | 1 | Structural rigidity & wind shield |
| **Quenching Manifold** | ⛔ **ON HOLD** — not to be built before the safety review | 0 | Was: hot liquid injection |
| **Support Legs** | Heavy-duty angle iron ($40 \times 40 \times 4\text{mm}$), $300\text{mm}$ clearance | 3 | Stability & valve clearance |

```text
       Top Rim (Ø 1200mm)
  \=========================/   <-- Flame Curtain (Combustion of Gases)
   \                       /
    \   Anoxic Pyrolysis  /     <-- Pyrolyzing Layer (500°C - 650°C)
     \       Zone        /
      \                 /
       \===============/        <-- (drain valve: ON HOLD)


⚙️ 3. Pyrolysis Operational
ProtocolPhase A: Fire Initiation & Bed FoundationPlace small, dry kindling ($<20\%\text{ moisture}$) at the bottom of the cone.
Ignite from the top to establish an immediate upper flame layer. Wait until the initial wood layer is glowing red without visible smoke ($\sim 10\text{ minutes}$).
Phase B: Continuous Layer FeedingSpread a uniform layer of biomass ($3 - 5\text{cm}$ thick) over the glowing embers.Observe the birth of yellow/translucent flames over the new biomass layer.
Critical Rule: Add the next biomass layer only when the previous layer turns gray/ash-coated on its upper surface. Do not overload to avoid suppressing the flame curtain.
Continue sequential feeding until the cone is filled to $90\%$ volume.
Phase C: Cooling & Nutrient Loading (REPLACES the suspended hot quench)
C1. Stop feeding. Let the charge cool **without adding any liquid** until the core is verified cold by measurement (target < 40 °C), with the top covered to exclude oxygen. The method and time are to be defined and validated by the safety review.
C2. Only when cold: remove the biochar and crush it (FFP3 respirator, section 5). Soak it in the nutrient solution at ambient temperature in a separate vessel. Nothing about soaking duration or solution strength is validated yet.

Quenching is covered by the safety review. A small-scale prototype test with a non-organic cooling procedure must be written up and approved before any run.


📊 4. Quality Control & Biochar CharacterizationParameterTest Method / MetricTarget ValueCorrective ActionpH ($1:10\text{ H}_2\text{O}$)Calibrated pH Probe$7.5 - 8.8$If $\text{pH} > 9.5$, increase rinse volume (on cooled biochar) or neutralize with citric acidVolatile Matter ContentProximate Analysis ($950^\circ\text{C}$ muffle furnace)$< 20\%$If $>25\%$, residence time was insufficient; decrease feeding rateWater Holding Capacity (WHC)Gravimetric saturation assay$\ge 250\%\text{ (w/w)}$Ensure crushing/milling particle size is $< 2\text{mm}$Ash ContentDry Combustion ($550^\circ\text{C}$, 4 hours)$< 10\%$Avoid soil/dirt inclusion in raw biomass input📜 Mechanical Maintenance & SafetyEPI Requirements: Heat-resistant leather welding gloves, full face shield, FFP3 dust respirator during biochar crushing.
Storage: Store crushed biochar in breathable polypropylene sacks under dry conditions to prevent spontaneous thermal oxidation.
