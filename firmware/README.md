# Firmware ESP32 — B.A. LAB

Emplacement **canonique** de tout le firmware (un seul projet PlatformIO). Remplace `firmware/esp32_climate_node.ino`, `iot-digital/` et `02_IoT_and_Automation/`.

> **Statut : non qualifié sur matériel.** Le code compile côté logique et passe ses tests sur PC, mais n'a **pas** été testé sur ESP32 réel ni compilé avec PlatformIO. Toutes les valeurs de `config.h` sont des valeurs par défaut **provisoires**.

## Deux nœuds

| Nœud | Dossier | Rôle | Capteurs | Actionneurs |
|---|---|---|---|---|
| `climate_node` | `src/climate_node/` | Température / humidité d'une enceinte d'incubation + purge d'air temporisée | DHT22 (GPIO 4) | Chauffage GPIO 16, humidificateur GPIO 17, ventilateur GPIO 18 |
| `irrigation_node` | `src/irrigation_node/` | Irrigation du substrat + extraction pilotée par le CO₂ | Humidité sol analogique (GPIO 34), SCD4x en I²C (SDA 21 / SCL 22) | Pompe GPIO 25, ventilateur GPIO 26 |

La logique de décision (hystérésis, délais, états sûrs) est dans `lib/control_logic/control_logic.h`, sans accès matériel, pour être testée sur PC.

## Construire et tester

```bash
cd firmware
pio run                      # les deux nœuds
pio run -e climate_node
pio run -e irrigation_node
pio run -e irrigation_node --target upload

sh test/run_tests.sh         # tests de logique + contrôle de syntaxe (g++ requis, sans matériel)
```

Les versions de plateforme et de bibliothèques de `platformio.ini` n'ont pas été vérifiées par un vrai `pio run` : à épingler après le premier build réussi.

`test/mocks/` ne contient que de faux en-têtes pour le contrôle de syntaxe ; ils ne remplacent pas le vrai SDK ESP32.

## Modèle de sécurité

1. **Mesure invalide ⇒ actionneurs dépendants OFF, immédiatement.** Lecture DHT22 en échec ou hors plage : chauffage et humidificateur coupés. Humidité sol aux rails ADC (capteur ouvert ou en court-circuit) : pompe coupée. CO₂ absent, en erreur, à 0 ppm ou périmé (> 20 s) : ventilateur CO₂ coupé et alarme sur le port série.
2. **Aucune valeur simulée.** Il n'y a plus de CO₂ factice à 800 ppm : sans lecture SCD4x réelle, la valeur est « invalide ».
3. **Durées maximales.** Chauffage : 30 min en continu puis 5 min de blocage. Pompe : 60 s puis 10 min de blocage. Chauffage verrouillé OFF à partir de 30 °C jusqu'au retour sous (consigne − hystérésis).
4. **Boucle non bloquante.** Plus de `delay(30000)` : la régulation continue pendant la purge.
5. **État initial sûr.** Le niveau « relais OFF » est écrit avant de passer la broche en sortie.
6. **Polarité des relais configurable** (`RELAY_ACTIVE_LOW`). Les deux nœuds ont désormais la même convention par défaut (actif à l'état bas). L'ancien `main.cpp` supposait l'inverse : **vérifier au multimètre, sans charge branchée, avant la première mise sous tension.**

### Ce que le logiciel ne remplace pas

- Un **thermostat de sécurité matériel indépendant** (coupe-circuit thermique) sur le chauffage. Si l'ESP32 se fige, les relais gardent leur dernier état.
- Pas de watchdog logiciel dans cette version (l'API varie selon la version du core Arduino-ESP32).
- La ventilation du `climate_node` est une **temporisation**, pas une régulation CO₂ (ce nœud n'a pas de capteur CO₂).
- Le code ne connecte pas le Wi-Fi et n'envoie aucune télémétrie.

## Calibration à faire avant usage

- Humidité sol : mesurer les valeurs brutes à sec (dans l'air) et saturé dans le substrat cible, puis remplacer `MOISTURE_RAW_DRY` / `MOISTURE_RAW_WET`. Les valeurs actuelles (4095 / 1500) sont des placeholders issus de l'ancien code.
- Seuils CO₂ (1200 / 1000 ppm) et humidité (45 / 50 %) : critères internes à valider par espèce et par phase (voir les protocoles dans Notion).
- Limites de sécurité (30 °C, 30 min, 60 s…) : à fixer selon le chauffage, la pompe et l'enceinte réels.

## Licence

MIT, voir `../LICENSE` et `../LICENSES/`.
