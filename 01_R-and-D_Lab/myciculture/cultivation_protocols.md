# 📊 Fungal Incubation & Fruiting Protocols

Environmental targets across colonization, primordia initiation, and fructification phases.

## Environmental Target Parameters

### *Pleurotus ostreatus / eryngii*
* **Incubation / Spawn Run:** $22-24^\circ\text{C}$ | $80-85\%$ RH | $\text{CO}_2 > 5000\text{ ppm}$ | Dark
* **Fruiting Phase:** $16-18^\circ\text{C}$ | $85-95\%$ RH | $\text{CO}_2 < 1000\text{ ppm}$ | 800-1500 Lux

### *Hericium erinaceus*
* **Incubation / Spawn Run:** $21-24^\circ\text{C}$ | $75-80\%$ RH | High $\text{CO}_2$ | Dark
* **Fruiting Phase:** $18-21^\circ\text{C}$ | $88-92\%$ RH | $\text{CO}_2 < 800\text{ ppm}$ | Indirect light

## Fructification Controls
* Fresh air exchange (FAE) must be synchronized with extraction fans via the firmware nodes in `firmware/` (see `firmware/README.md`) when $\text{CO}_2$ exceeds phase thresholds.
