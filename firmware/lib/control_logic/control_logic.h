// SPDX-License-Identifier: MIT
// Copyright (c) 2026 SARL B.A. LAB
//
// Pure control logic for the B.A. LAB ESP32 nodes.
// No hardware access: every function takes its inputs explicitly so it can be
// unit-tested on a PC (see firmware/test/run_tests.sh).
//
// Design rules (see firmware/README.md, "Safety model"):
//   * An invalid or missing measurement NEVER leaves an actuator in its last
//     state: every dependent actuator is forced OFF.
//   * Heater and pump have a maximum continuous run time followed by a lockout.
//   * Time arithmetic is wrap-safe (uint32_t millis rollover after ~49 days).
//   * All numeric limits live in each node's config.h. The defaults shipped
//     there are PROVISIONAL and must be validated on the real hardware.
#pragma once

#include <stdint.h>

namespace ba {

// ---------------------------------------------------------------- helpers --

// Wrap-safe "has `duration` elapsed since `since`?"
inline bool elapsed(uint32_t now, uint32_t since, uint32_t duration) {
  return (uint32_t)(now - since) >= duration;
}

// Turn ON below `on_below`, turn OFF at or above `off_at`, otherwise keep state.
inline bool hysteresisLow(bool on, float v, float on_below, float off_at) {
  if (v < on_below) return true;
  if (v >= off_at) return false;
  return on;
}

// Turn ON above `on_above`, turn OFF at or below `off_at`, otherwise keep state.
inline bool hysteresisHigh(bool on, float v, float on_above, float off_at) {
  if (v > on_above) return true;
  if (v <= off_at) return false;
  return on;
}

// Linear map of a raw ADC value to 0..100 %, clamped. `raw_dry` -> 0 %, `raw_wet` -> 100 %.
inline float moisturePercent(int raw, int raw_dry, int raw_wet) {
  if (raw_dry == raw_wet) return 0.0f;
  float p = 100.0f * (float)(raw_dry - raw) / (float)(raw_dry - raw_wet);
  if (p < 0.0f) p = 0.0f;
  if (p > 100.0f) p = 100.0f;
  return p;
}

// A raw ADC reading pinned at a rail (open or shorted sensor) is NOT a measurement.
inline bool adcPlausible(int raw, int margin) {
  return raw > margin && raw < (4095 - margin);
}

// ---------------------------------------------------------- climate node --

struct ClimateConfig {
  float temp_setpoint_c;
  float temp_hysteresis_c;
  float temp_hard_max_c;           // heater latched OFF at or above this
  float hum_setpoint;
  float hum_hysteresis;
  uint32_t heater_max_on_ms;       // max continuous heating
  uint32_t heater_cooldown_ms;     // forced OFF period after max_on reached
  uint32_t humidifier_max_on_ms;   // max continuous humidification (prevent water overflow)
  uint32_t humidifier_cooldown_ms; // forced OFF period after humidifier max_on reached
  uint8_t  fault_after_failed_reads;
  uint32_t purge_interval_ms;      // timed fresh-air purge (NOT CO2-driven)
  uint32_t purge_duration_ms;
};

struct ClimateInput {
  bool valid;      // false if the sensor read failed
  float temp_c;
  float hum;
  uint32_t now_ms;
};

struct ClimateState {
  bool heater;
  bool humidifier;
  bool fan;
  bool fault;            // sensor lost for >= fault_after_failed_reads cycles
  bool overtemp_latched;
  bool heater_lockout;
  bool humidifier_lockout;
  uint8_t failed_reads;
  uint32_t heater_on_since;
  uint32_t heater_lockout_since;
  uint32_t humidifier_on_since;
  uint32_t humidifier_lockout_since;
  uint32_t purge_ref;    // end of last purge (or boot)
  bool purging;
};

inline ClimateState climateInit(uint32_t now_ms) {
  ClimateState s = {};
  s.purge_ref = now_ms;
  return s;
}

inline bool climateInputPlausible(const ClimateInput& in) {
  return in.valid && in.temp_c > -40.0f && in.temp_c < 80.0f &&
         in.hum >= 0.0f && in.hum <= 100.0f;
}

// Sensor-driven part (heater + humidifier). Call at each sensor cycle.
inline void climateStepSensors(const ClimateConfig& c, ClimateState& s,
                               const ClimateInput& in) {
  if (!climateInputPlausible(in)) {
    // FAIL-SAFE: no trustworthy measurement -> heater and humidifier OFF, now.
    s.heater = false;
    s.humidifier = false;
    if (s.failed_reads < 255) s.failed_reads++;
    if (s.failed_reads >= c.fault_after_failed_reads) s.fault = true;
    return;
  }
  s.failed_reads = 0;
  s.fault = false;

  // Over-temperature latch: independent of the normal hysteresis.
  if (in.temp_c >= c.temp_hard_max_c) {
    s.overtemp_latched = true;
  } else if (s.overtemp_latched &&
             in.temp_c < c.temp_setpoint_c - c.temp_hysteresis_c) {
    s.overtemp_latched = false;
  }

  // Heater lockout release after cooldown.
  if (s.heater_lockout && elapsed(in.now_ms, s.heater_lockout_since, c.heater_cooldown_ms)) {
    s.heater_lockout = false;
  }

  bool want_heat = hysteresisLow(s.heater, in.temp_c,
                                 c.temp_setpoint_c - c.temp_hysteresis_c,
                                 c.temp_setpoint_c);
  if (s.overtemp_latched || s.heater_lockout) want_heat = false;

  if (want_heat && !s.heater) s.heater_on_since = in.now_ms;
  if (want_heat && s.heater && elapsed(in.now_ms, s.heater_on_since, c.heater_max_on_ms)) {
    want_heat = false;
    s.heater_lockout = true;
    s.heater_lockout_since = in.now_ms;
  }
  s.heater = want_heat;

  // Humidifier lockout release after cooldown.
  if (s.humidifier_lockout && elapsed(in.now_ms, s.humidifier_lockout_since, c.humidifier_cooldown_ms)) {
    s.humidifier_lockout = false;
  }

  bool want_humid = hysteresisLow(s.humidifier, in.hum,
                                  c.hum_setpoint - c.hum_hysteresis, c.hum_setpoint);
  if (s.humidifier_lockout) want_humid = false;

  if (want_humid && !s.humidifier) s.humidifier_on_since = in.now_ms;
  if (want_humid && s.humidifier && elapsed(in.now_ms, s.humidifier_on_since, c.humidifier_max_on_ms)) {
    want_humid = false;
    s.humidifier_lockout = true;
    s.humidifier_lockout_since = in.now_ms;
  }
  s.humidifier = want_humid;
}

// Timed purge (non-blocking). Independent of sensors.
inline void climateStepPurge(const ClimateConfig& c, ClimateState& s, uint32_t now_ms) {
  if (!s.purging) {
    if (elapsed(now_ms, s.purge_ref, c.purge_interval_ms)) {
      s.purging = true;
      s.fan = true;
      s.purge_ref = now_ms;          // start of the running purge
    }
  } else if (elapsed(now_ms, s.purge_ref, c.purge_duration_ms)) {
    s.purging = false;
    s.fan = false;
    s.purge_ref = now_ms;            // interval counts from the end of the purge
  }
}

// ------------------------------------------------------ irrigation node --

struct IrrigationConfig {
  float moist_on_below;
  float moist_off_at;
  uint32_t pump_max_run_ms;
  uint32_t pump_lockout_ms;
  uint16_t co2_on_above_ppm;
  uint16_t co2_off_at_ppm;
};

struct IrrigationInput {
  bool moisture_valid;
  float moisture_pct;
  bool co2_valid;      // false on read error, stale data, or 0 ppm
  uint16_t co2_ppm;
  uint32_t now_ms;
};

struct IrrigationState {
  bool pump;
  bool fan;
  bool pump_lockout;
  uint32_t pump_on_since;
  uint32_t pump_lockout_since;
};

inline void irrigationStep(const IrrigationConfig& c, IrrigationState& s,
                           const IrrigationInput& in) {
  // ---- pump ----
  if (s.pump_lockout && elapsed(in.now_ms, s.pump_lockout_since, c.pump_lockout_ms)) {
    s.pump_lockout = false;
  }
  bool want_pump = false;
  if (in.moisture_valid) {
    want_pump = hysteresisLow(s.pump, in.moisture_pct, c.moist_on_below, c.moist_off_at);
  }  // invalid moisture -> pump OFF (fail-safe)
  if (s.pump_lockout) want_pump = false;

  if (want_pump && !s.pump) s.pump_on_since = in.now_ms;
  if (want_pump && s.pump && elapsed(in.now_ms, s.pump_on_since, c.pump_max_run_ms)) {
    want_pump = false;
    s.pump_lockout = true;
    s.pump_lockout_since = in.now_ms;
  }
  s.pump = want_pump;

  // ---- fan (CO2-driven) ----
  // Invalid CO2 -> fan OFF: the dependent automatism is stopped, never driven
  // by a simulated or stale value. The node must raise an alarm (log) for it.
  if (in.co2_valid) {
    s.fan = hysteresisHigh(s.fan, (float)in.co2_ppm, (float)c.co2_on_above_ppm,
                           (float)c.co2_off_at_ppm);
  } else {
    s.fan = false;
  }
}

}  // namespace ba
