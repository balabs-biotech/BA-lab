// Host-side unit tests for lib/control_logic/control_logic.h. No hardware needed.
#include <stdint.h>
#include <stdio.h>
#include "control_logic.h"

static int g_fail = 0, g_run = 0;
#define CHECK(c) do { g_run++; if (!(c)) { g_fail++; printf("FAIL %s:%d  %s\n", __FILE__, __LINE__, #c); } } while (0)

static const ba::ClimateConfig CC = {24.0f, 0.5f, 30.0f, 85.0f, 3.0f,
                                     30UL * 60 * 1000, 5UL * 60 * 1000, 3,
                                     300000UL, 30000UL};
static ba::ClimateInput cin(float t, float h, uint32_t now, bool valid = true) {
  ba::ClimateInput i; i.valid = valid; i.temp_c = t; i.hum = h; i.now_ms = now; return i;
}

static void test_helpers() {
  CHECK(ba::hysteresisLow(false, 20, 23.5f, 24) == true);
  CHECK(ba::hysteresisLow(true, 23.8f, 23.5f, 24) == true);   // inside band: keep
  CHECK(ba::hysteresisLow(false, 23.8f, 23.5f, 24) == false); // inside band: keep
  CHECK(ba::hysteresisLow(true, 24.0f, 23.5f, 24) == false);
  CHECK(ba::hysteresisHigh(false, 1300, 1200, 1000) == true);
  CHECK(ba::hysteresisHigh(true, 1100, 1200, 1000) == true);
  CHECK(ba::hysteresisHigh(true, 1000, 1200, 1000) == false);
  CHECK(ba::elapsed(10, 0, 10));
  CHECK(!ba::elapsed(9, 0, 10));
  CHECK(ba::elapsed(5, 0xFFFFFFF0u, 20));   // millis wrap-around
  CHECK(!ba::elapsed(5, 0xFFFFFFF0u, 22));
  CHECK(ba::moisturePercent(4095, 4095, 1500) == 0.0f);
  CHECK(ba::moisturePercent(1500, 4095, 1500) == 100.0f);
  CHECK(ba::moisturePercent(5000, 4095, 1500) == 0.0f);     // clamped
  CHECK(ba::moisturePercent(0, 4095, 1500) == 100.0f);      // clamped
  CHECK(!ba::adcPlausible(4095, 10));
  CHECK(!ba::adcPlausible(0, 10));
  CHECK(ba::adcPlausible(2800, 10));
}

static void test_climate_normal() {
  ba::ClimateState s = ba::climateInit(0);
  ba::climateStepSensors(CC, s, cin(20.0f, 70.0f, 2000));
  CHECK(s.heater && s.humidifier);
  ba::climateStepSensors(CC, s, cin(24.1f, 86.0f, 4000));
  CHECK(!s.heater && !s.humidifier);
}

static void test_climate_failsafe_on_sensor_loss() {
  ba::ClimateState s = ba::climateInit(0);
  ba::climateStepSensors(CC, s, cin(20.0f, 70.0f, 2000));
  CHECK(s.heater && s.humidifier);
  // The audited bug: a failed read used to leave relays ON. Now: OFF immediately.
  ba::climateStepSensors(CC, s, cin(0, 0, 4000, false));
  CHECK(!s.heater && !s.humidifier);
  CHECK(!s.fault);                       // 1 failure: not yet a fault
  ba::climateStepSensors(CC, s, cin(0, 0, 6000, false));
  ba::climateStepSensors(CC, s, cin(0, 0, 8000, false));
  CHECK(s.fault && !s.heater && !s.humidifier);
  ba::climateStepSensors(CC, s, cin(20.0f, 70.0f, 10000));   // recovery
  CHECK(!s.fault && s.heater && s.humidifier);
  // NaN-like / implausible values are treated as invalid too
  ba::climateStepSensors(CC, s, cin(150.0f, 50.0f, 12000));
  CHECK(!s.heater);
  ba::climateStepSensors(CC, s, cin(20.0f, 120.0f, 14000));
  CHECK(!s.humidifier);
}

static void test_climate_overtemp_latch() {
  ba::ClimateState s = ba::climateInit(0);
  ba::climateStepSensors(CC, s, cin(20.0f, 80.0f, 2000));
  CHECK(s.heater);
  ba::climateStepSensors(CC, s, cin(30.5f, 80.0f, 4000));
  CHECK(!s.heater && s.overtemp_latched);
  ba::climateStepSensors(CC, s, cin(23.8f, 80.0f, 6000));    // below setpoint but above release
  CHECK(!s.heater && s.overtemp_latched);
  ba::climateStepSensors(CC, s, cin(23.0f, 80.0f, 8000));    // released
  CHECK(!s.overtemp_latched && s.heater);
}

static void test_climate_heater_max_on_and_lockout() {
  ba::ClimateState s = ba::climateInit(0);
  uint32_t t = 2000;
  ba::climateStepSensors(CC, s, cin(15.0f, 80.0f, t));       // heater ON, on_since = 2000
  CHECK(s.heater);
  t = 2000 + CC.heater_max_on_ms - 1;
  ba::climateStepSensors(CC, s, cin(15.0f, 80.0f, t));
  CHECK(s.heater);
  t += 1;
  ba::climateStepSensors(CC, s, cin(15.0f, 80.0f, t));       // max reached
  CHECK(!s.heater && s.heater_lockout);
  t += CC.heater_cooldown_ms - 1;
  ba::climateStepSensors(CC, s, cin(15.0f, 80.0f, t));
  CHECK(!s.heater);                                          // still locked out
  t += 1;
  ba::climateStepSensors(CC, s, cin(15.0f, 80.0f, t));
  CHECK(s.heater && !s.heater_lockout);                      // cooled down, restarts
}

static void test_climate_purge_non_blocking() {
  ba::ClimateState s = ba::climateInit(0);
  ba::climateStepPurge(CC, s, 299999);  CHECK(!s.fan);
  ba::climateStepPurge(CC, s, 300000);  CHECK(s.fan && s.purging);
  // The sensor logic keeps running while the purge is active (no delay()).
  ba::climateStepSensors(CC, s, cin(20.0f, 70.0f, 310000));
  CHECK(s.heater && s.fan);
  ba::climateStepPurge(CC, s, 329999);  CHECK(s.fan);
  ba::climateStepPurge(CC, s, 330000);  CHECK(!s.fan && !s.purging);
  ba::climateStepPurge(CC, s, 629999);  CHECK(!s.fan);       // interval from end of purge
  ba::climateStepPurge(CC, s, 630000);  CHECK(s.fan);
}

static const ba::IrrigationConfig IC = {45.0f, 50.0f, 60000UL, 600000UL, 1200, 1000};
static ba::IrrigationInput iin(bool mv, float m, bool cv, uint16_t c, uint32_t now) {
  ba::IrrigationInput i; i.moisture_valid = mv; i.moisture_pct = m;
  i.co2_valid = cv; i.co2_ppm = c; i.now_ms = now; return i;
}

static void test_irrigation_pump() {
  ba::IrrigationState s = {};
  ba::irrigationStep(IC, s, iin(true, 40, true, 800, 1000));
  CHECK(s.pump);
  ba::irrigationStep(IC, s, iin(true, 47, true, 800, 2000));  // inside band: keep ON
  CHECK(s.pump);
  ba::irrigationStep(IC, s, iin(true, 50, true, 800, 3000));
  CHECK(!s.pump);
  // fail-safe: invalid moisture while pumping -> OFF
  ba::irrigationStep(IC, s, iin(true, 10, true, 800, 4000));
  CHECK(s.pump);
  ba::irrigationStep(IC, s, iin(false, 0, true, 800, 5000));
  CHECK(!s.pump);
}

static void test_irrigation_pump_max_run() {
  ba::IrrigationState s = {};
  uint32_t t = 1000;
  ba::irrigationStep(IC, s, iin(true, 10, true, 800, t));     // ON
  CHECK(s.pump);
  t += IC.pump_max_run_ms - 1;
  ba::irrigationStep(IC, s, iin(true, 10, true, 800, t));
  CHECK(s.pump);
  t += 1;
  ba::irrigationStep(IC, s, iin(true, 10, true, 800, t));     // stuck-dry sensor: stop
  CHECK(!s.pump && s.pump_lockout);
  t += IC.pump_lockout_ms - 1;
  ba::irrigationStep(IC, s, iin(true, 10, true, 800, t));
  CHECK(!s.pump);
  t += 1;
  ba::irrigationStep(IC, s, iin(true, 10, true, 800, t));
  CHECK(s.pump && !s.pump_lockout);
}

static void test_irrigation_fan_and_invalid_co2() {
  ba::IrrigationState s = {};
  ba::irrigationStep(IC, s, iin(true, 60, true, 1300, 1000));
  CHECK(s.fan);
  ba::irrigationStep(IC, s, iin(true, 60, true, 1100, 2000));
  CHECK(s.fan);                                               // inside band: keep
  ba::irrigationStep(IC, s, iin(true, 60, true, 1000, 3000));
  CHECK(!s.fan);
  ba::irrigationStep(IC, s, iin(true, 60, true, 1500, 4000));
  CHECK(s.fan);
  // No simulated 800 ppm: invalid CO2 stops the dependent automatism.
  ba::irrigationStep(IC, s, iin(true, 60, false, 0, 5000));
  CHECK(!s.fan);
}

int main() {
  test_helpers();
  test_climate_normal();
  test_climate_failsafe_on_sensor_loss();
  test_climate_overtemp_latch();
  test_climate_heater_max_on_and_lockout();
  test_climate_purge_non_blocking();
  test_irrigation_pump();
  test_irrigation_pump_max_run();
  test_irrigation_fan_and_invalid_co2();
  printf("%d checks, %d failed\n", g_run, g_fail);
  return g_fail ? 1 : 0;
}
