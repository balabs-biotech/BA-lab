# ESP32 Firmware — B.A. LAB

**Canonical location** of all firmware: one PlatformIO project. It replaces `firmware/esp32_climate_node.ino`, `iot-digital/` and `02_IoT_and_Automation/`.

> **Status: not qualified on hardware.** The control logic passes host-side tests, but the firmware has **not** been compiled with PlatformIO or run on a real ESP32. Every value in `config.h` is a **provisional default**.

## Two nodes

| Node | Folder | Role | Sensors | Actuators |
|---|---|---|---|---|
| `climate_node` | `src/climate_node/` | Temperature / humidity of an incubation chamber, plus a timed air purge | DHT22 (GPIO 4) | Heater GPIO 16, humidifier GPIO 17, fan GPIO 18 |
| `irrigation_node` | `src/irrigation_node/` | Substrate irrigation and CO₂-driven extraction | Analog soil moisture (GPIO 34), SCD4x over I²C (SDA 21 / SCL 22) | Pump GPIO 25, fan GPIO 26 |

Decision logic (hysteresis, timers, safe states) lives in `lib/control_logic/control_logic.h`. It has no hardware access, so it can be tested on a PC.

## Build and test

```bash
cd firmware
pio run                              # both nodes
pio run -e climate_node
pio run -e irrigation_node --target upload

sh test/run_tests.sh                 # logic tests + syntax check (needs g++, no hardware)
```

Platform and library versions in `platformio.ini` have not been verified by a real `pio run`; pin exact versions after the first successful build. `test/mocks/` holds fake headers used only for the syntax check; they do not replace the real ESP32 SDK or the real SCD4x library.

## Safety model

1. **Invalid measurement ⇒ dependent actuators OFF, immediately.** Failed or out-of-range DHT22 read: heater and humidifier OFF. Soil ADC pinned at a rail (open or shorted sensor): pump OFF. CO₂ missing, erroring, 0 ppm or older than 20 s: CO₂ fan OFF and an alarm on the serial port.
2. **No simulated values.** The former fake 800 ppm CO₂ is gone; without a real SCD4x reading the value is *invalid*.
3. **Maximum run times.** Heater: 30 min continuous, then 5 min lockout. Pump: 60 s, then 10 min lockout. Heater latched OFF at 30 °C until the temperature falls back below (setpoint − hysteresis).
4. **Non-blocking loop.** No more `delay(30000)`: regulation keeps running during the purge.
5. **Safe start-up.** The relay OFF level is written before the pin becomes an output.
6. **Configurable relay polarity** (`RELAY_ACTIVE_LOW`). Both nodes now share the same default (energised on LOW). The old irrigation sketch assumed the opposite: **check with a multimeter, with no load connected, before first power-up.**

### What software does not replace

- An **independent hardware thermal cut-out** on the heater. If the ESP32 hangs, the relays keep their last state.
- There is no software watchdog in this version (the API differs between Arduino-ESP32 core versions).
- Ventilation on `climate_node` is a **timer**, not CO₂ regulation (that node has no CO₂ sensor).
- The code does not connect to Wi-Fi and sends no telemetry.

## Calibration required before use

- Soil moisture: measure raw values in air (dry) and in saturated target substrate, then replace `MOISTURE_RAW_DRY` / `MOISTURE_RAW_WET`. The current values (4095 / 1500) are placeholders carried over from the old code.
- CO₂ thresholds (1200 / 1000 ppm) and moisture thresholds (45 / 50 %): internal targets to be validated per species and growth phase (reference protocols are in Notion).
- Safety limits (30 °C, 30 min, 60 s, …): to be set for the actual heater, pump and chamber.

## Licence

MIT — see `../LICENSE` and `../LICENSES/`.
