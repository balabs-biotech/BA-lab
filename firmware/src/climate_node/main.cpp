// SPDX-License-Identifier: MIT
// Copyright (c) 2026 SARL B.A. LAB
//
// B.A. LAB — Environmental & Incubation Climate Node (ESP32 + DHT22).
// Regulates temperature and relative humidity, plus a timed air purge.
// Safety model: see firmware/README.md. Logic: lib/control_logic/control_logic.h.

#include <Arduino.h>
#include <DHT.h>

#include "config.h"
#include "control_logic.h"

static DHT dht(PIN_DHT, DHT22);

static const ba::ClimateConfig kCfg = {
    TEMP_SETPOINT_C, TEMP_HYSTERESIS_C, TEMP_HARD_MAX_C,
    HUM_SETPOINT,    HUM_HYSTERESIS,
    HEATER_MAX_ON_MS, HEATER_COOLDOWN_MS,
    FAULT_AFTER_FAILED_READS,
    PURGE_INTERVAL_MS, PURGE_DURATION_MS};

static ba::ClimateState gState;
static uint32_t gLastSensorMs = 0;

static inline uint8_t relayLevel(bool on) {
  return (on == RELAY_ACTIVE_LOW) ? LOW : HIGH;
}

static void relayInit(uint8_t pin) {
  digitalWrite(pin, relayLevel(false));  // preload the OFF level, then drive it
  pinMode(pin, OUTPUT);
  digitalWrite(pin, relayLevel(false));
}

static void applyOutputs() {
  digitalWrite(PIN_RELAY_HEATER, relayLevel(gState.heater));
  digitalWrite(PIN_RELAY_HUMID, relayLevel(gState.humidifier));
  digitalWrite(PIN_RELAY_FAN, relayLevel(gState.fan));
}

void setup() {
  Serial.begin(115200);
  relayInit(PIN_RELAY_HEATER);
  relayInit(PIN_RELAY_HUMID);
  relayInit(PIN_RELAY_FAN);
  dht.begin();
  gState = ba::climateInit(millis());
  Serial.println(F("[INIT] Climate node up. All relays OFF."));
}

void loop() {
  const uint32_t now = millis();

  if (ba::elapsed(now, gLastSensorMs, SENSOR_INTERVAL_MS)) {
    gLastSensorMs = now;

    ba::ClimateInput in;
    in.temp_c = dht.readTemperature();
    in.hum = dht.readHumidity();
    in.valid = !(isnan(in.temp_c) || isnan(in.hum));
    in.now_ms = now;

    const bool wasFault = gState.fault;
    ba::climateStepSensors(kCfg, gState, in);

    if (!in.valid) {
      Serial.println(F("[ERROR] DHT read failed -> heater and humidifier forced OFF"));
    } else {
      Serial.printf("[DATA] T=%.1f C RH=%.1f %% heater=%d humid=%d overtemp=%d lockout=%d\n",
                    in.temp_c, in.hum, gState.heater, gState.humidifier,
                    gState.overtemp_latched, gState.heater_lockout);
    }
    if (gState.fault && !wasFault) {
      Serial.println(F("[FAULT] Sensor lost. Climate control suspended (actuators OFF)."));
    }
  }

  ba::climateStepPurge(kCfg, gState, now);  // non-blocking, independent of sensors
  applyOutputs();
}
