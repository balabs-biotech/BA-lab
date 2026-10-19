// SPDX-License-Identifier: MIT
// Copyright (c) 2026 SARL B.A. LAB
//
// B.A. LAB — Irrigation & CO2 purge node (ESP32 + capacitive soil sensor + SCD4x).
// CO2 comes from a real SCD4x read. There is NO simulated value: if the sensor is
// absent, errors out, returns 0 ppm, or goes stale, CO2 is INVALID and the
// CO2-driven fan is forced OFF with a logged alarm.

#include <Arduino.h>
#include <SensirionI2CScd4x.h>
#include <Wire.h>

#include "config.h"
#include "control_logic.h"

static SensirionI2CScd4x scd4x;

static const ba::IrrigationConfig kCfg = {
    MOISTURE_ON_BELOW_PCT, MOISTURE_OFF_AT_PCT,
    PUMP_MAX_RUN_MS, PUMP_LOCKOUT_MS,
    CO2_ON_ABOVE_PPM, CO2_OFF_AT_PPM};

static ba::IrrigationState gState;
static uint32_t gLastSensorMs = 0;
static uint32_t gLastCo2OkMs = 0;
static bool gCo2EverOk = false;
static uint16_t gLastCo2 = 0;
static bool gScd4xStarted = false;

static inline uint8_t relayLevel(bool on) {
  return (on == RELAY_ACTIVE_LOW) ? LOW : HIGH;
}

static void relayInit(uint8_t pin) {
  digitalWrite(pin, relayLevel(false));
  pinMode(pin, OUTPUT);
  digitalWrite(pin, relayLevel(false));
}

static bool startScd4x() {
  scd4x.begin(Wire);
  scd4x.stopPeriodicMeasurement();  // may fail if not running; ignore
  delay(500);
  return scd4x.startPeriodicMeasurement() == 0;
}

// Returns true only for a fresh, plausible SCD4x measurement.
static bool readCo2(uint16_t& co2) {
  uint16_t raw = 0;
  float t = 0.0f, rh = 0.0f;
  if (scd4x.readMeasurement(raw, t, rh) != 0) return false;  // error / not ready
  if (raw == 0) return false;                                // 0 ppm = no valid sample yet
  co2 = raw;
  return true;
}

void setup() {
  Serial.begin(115200);
  relayInit(PIN_RELAY_PUMP);
  relayInit(PIN_RELAY_FAN);
  pinMode(PIN_SOIL_MOISTURE, INPUT);

  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  gScd4xStarted = startScd4x();
  if (!gScd4xStarted) {
    Serial.println(F("[ALARM] SCD4x init failed: CO2 invalid, CO2 fan disabled."));
  }
  Serial.println(F("[INIT] Irrigation node up. All relays OFF."));
}

void loop() {
  const uint32_t now = millis();

  if (ba::elapsed(now, gLastSensorMs, SENSOR_INTERVAL_MS)) {
    gLastSensorMs = now;

    // --- soil moisture ---
    const int raw = analogRead(PIN_SOIL_MOISTURE);
    ba::IrrigationInput in;
    in.moisture_valid = ba::adcPlausible(raw, ADC_FAULT_MARGIN);
    in.moisture_pct = ba::moisturePercent(raw, MOISTURE_RAW_DRY, MOISTURE_RAW_WET);

    // --- CO2 (real sensor only) ---
    uint16_t co2 = 0;
    if (gScd4xStarted && readCo2(co2)) {
      gLastCo2 = co2;
      gLastCo2OkMs = now;
      gCo2EverOk = true;
    }
    in.co2_valid = gCo2EverOk && !ba::elapsed(now, gLastCo2OkMs, CO2_MAX_AGE_MS);
    in.co2_ppm = gLastCo2;
    in.now_ms = now;

    const bool pumpWas = gState.pump;
    const bool lockWas = gState.pump_lockout;
    ba::irrigationStep(kCfg, gState, in);

    if (in.moisture_valid) {
      Serial.printf("[DATA] moisture=%.0f%% (raw %d) ", in.moisture_pct, raw);
    } else {
      Serial.printf("[ALARM] moisture sensor INVALID (raw %d): pump forced OFF ", raw);
    }
    if (in.co2_valid) {
      Serial.printf("| CO2=%u ppm\n", (unsigned)in.co2_ppm);
    } else {
      Serial.println(F("| [ALARM] CO2 INVALID: CO2 fan forced OFF"));
    }
    if (gState.pump != pumpWas) {
      Serial.println(gState.pump ? F("[ACTION] Pump ON") : F("[ACTION] Pump OFF"));
    }
    if (gState.pump_lockout && !lockWas) {
      Serial.println(F("[ALARM] Pump max run time reached: lockout started."));
    }
  }

  digitalWrite(PIN_RELAY_PUMP, relayLevel(gState.pump));
  digitalWrite(PIN_RELAY_FAN, relayLevel(gState.fan));
}
