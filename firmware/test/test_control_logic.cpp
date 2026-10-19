// Host-side unit tests for lib/control_logic/control_logic.h. No hardware needed.
#include <stdint.h>
#include <stdio.h>
#include "control_logic.h"

static int g_fail = 0, g_run = 0;
#define CHECK(c) do { g_run++; if (!(c)) { g_fail++; printf("FAIL %s:%d  %s\n", __FILE__, __LINE__, #c); } } while (0)

static const ba::ClimateConfig CC = {24.0f, 0.5f, 30.0f, 85.0f, 3.0f,
                                     30UL * 60 * 1000, 5UL * 60 * 1000,  // heater: 30 min on, 5 min cooldown
                                     20UL * 60 * 1000, 5UL * 60 * 1000,  // humidifier: 20 min on, 5 min cooldown
                                     3,
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

static void test_irrigation_moisture_invalid_adc_rail() {
  // ADC pinned at a rail (open or shorted sensor) should stop the pump.
  ba::IrrigationState s = {};
  // Valid state
  ba::irrigationStep(IC, s, iin(true, 40, true, 800, 1000));
  CHECK(s.pump);
  // ADC pinned at rail -> invalid
  ba::irrigationStep(IC, s, iin(false, 0, true, 800, 2000));
  CHECK(!s.pump);
  // Recovery after a valid read
  ba::irrigationStep(IC, s, iin(true, 30, true, 800, 3000));
  CHECK(s.pump);
}

static void test_climate_purge_survives_sensor_loss() {
  // Purge timer should keep running even if the sensor is down
  ba::ClimateState s = ba::climateInit(0);
  ba::climateStepPurge(CC, s, 299999);
  CHECK(!s.fan);
  // Sensor fails
  ba::climateStepSensors(CC, s, cin(0, 0, 300000, false));
  // But purge should start (timer-based, not sensor-based)
  ba::climateStepPurge(CC, s, 300000);
  CHECK(s.fan && s.purging);
  // Heater and humidifier OFF due to failed sensor
  CHECK(!s.heater && !s.humidifier);
  // Purge continues
  ba::climateStepPurge(CC, s, 310000);
  CHECK(s.fan);
  // Purge ends and resets timer
  ba::climateStepPurge(CC, s, 330000);
  CHECK(!s.fan && !s.purging);
}

static void test_climate_recovery_from_extended_fault() {
  // After multiple failed reads, a single valid read should recover.
  ba::ClimateState s = ba::climateInit(0);
  // Fault condition: 3 consecutive failed reads (fault_after_failed_reads = 3)
  ba::climateStepSensors(CC, s, cin(0, 0, 1000, false));
  CHECK(s.failed_reads == 1 && !s.fault);
  ba::climateStepSensors(CC, s, cin(0, 0, 2000, false));
  CHECK(s.failed_reads == 2 && !s.fault);
  ba::climateStepSensors(CC, s, cin(0, 0, 3000, false));
  CHECK(s.failed_reads == 3 && s.fault);
  CHECK(!s.heater && !s.humidifier);
  // Single valid read should clear fault
  ba::climateStepSensors(CC, s, cin(20.0f, 70.0f, 4000));
  CHECK(!s.fault && s.failed_reads == 0);
  CHECK(s.heater && s.humidifier);  // Resume normal operation
}

static void test_climate_boundary_values() {
  // Test with temperature and humidity at exact setpoint boundaries
  // hysteresisLow: turns ON when v < on_below, OFF when v >= off_at
  ba::ClimateState s = ba::climateInit(0);
  // Config: temp_setpoint = 24.0, hysteresis = 0.5, hum_setpoint = 85, hum_hysteresis = 3

  // Below lower boundary (< 23.5): should turn ON
  ba::climateStepSensors(CC, s, cin(23.4f, 70.0f, 1000));
  CHECK(s.heater);

  // At upper boundary (>= 24.0): should turn OFF
  ba::climateStepSensors(CC, s, cin(24.0f, 70.0f, 2000));
  CHECK(!s.heater);

  // Inside band (23.5 <= v < 24.0): keeps OFF
  ba::climateStepSensors(CC, s, cin(23.7f, 70.0f, 3000));
  CHECK(!s.heater);

  // Below lower boundary of humidity (< 82): should turn ON
  ba::climateStepSensors(CC, s, cin(20.0f, 81.9f, 4000));
  CHECK(s.humidifier);

  // At upper boundary of humidity (>= 85): should turn OFF
  ba::climateStepSensors(CC, s, cin(20.0f, 85.0f, 5000));
  CHECK(!s.humidifier);
}

static void test_irrigation_pump_lockout_edge_case() {
  // Ensure pump lockout is correctly released at exact time boundary
  ba::IrrigationState s = {};
  uint32_t t = 1000;
  ba::irrigationStep(IC, s, iin(true, 10, true, 800, t));
  CHECK(s.pump);
  // Max run reached
  t += IC.pump_max_run_ms;
  ba::irrigationStep(IC, s, iin(true, 10, true, 800, t));
  CHECK(!s.pump && s.pump_lockout);
  // One ms before lockout expiry
  t += IC.pump_lockout_ms - 1;
  ba::irrigationStep(IC, s, iin(true, 10, true, 800, t));
  CHECK(s.pump_lockout);
  // Exact lockout expiry: should be released
  ba::irrigationStep(IC, s, iin(true, 10, true, 800, t + 1));
  CHECK(!s.pump_lockout);
}

static void test_climate_humidifier_max_on_and_lockout() {
  // Same pattern as heater: max continuous run followed by forced cooldown
  ba::ClimateState s = ba::climateInit(0);
  uint32_t t = 2000;
  ba::climateStepSensors(CC, s, cin(15.0f, 80.0f, t));  // humidifier ON, on_since = 2000
  CHECK(s.humidifier);
  t = 2000 + CC.humidifier_max_on_ms - 1;
  ba::climateStepSensors(CC, s, cin(15.0f, 80.0f, t));
  CHECK(s.humidifier);
  t += 1;
  ba::climateStepSensors(CC, s, cin(15.0f, 80.0f, t));  // max reached
  CHECK(!s.humidifier && s.humidifier_lockout);
  t += CC.humidifier_cooldown_ms - 1;
  ba::climateStepSensors(CC, s, cin(15.0f, 80.0f, t));
  CHECK(!s.humidifier);  // still locked out
  t += 1;
  ba::climateStepSensors(CC, s, cin(15.0f, 80.0f, t));
  CHECK(s.humidifier && !s.humidifier_lockout);  // cooled down, restarts
}

static void test_irrigation_initialization() {
  ba::IrrigationState s = {};
  CHECK(!s.pump);                           // pump OFF at start (aggregate init)
  CHECK(!s.fan);                            // fan OFF at start
  CHECK(!s.pump_lockout);                   // no lockout yet
}

static void test_climate_rapid_cycling() {
  ba::ClimateState s = ba::climateInit(0);
  uint32_t t = 2000;
  // Start from cold to activate heater
  ba::climateStepSensors(CC, s, cin(20.0f, 80.0f, t));
  CHECK(s.heater && s.humidifier);
  t += 100;
  // Oscillate rapidly around setpoint: should not cause excessive lockout
  for (int i = 0; i < 5; i++) {
    ba::climateStepSensors(CC, s, cin(23.4f, 82.0f, t));  // below hysteresis: keep heating
    t += 100;
    ba::climateStepSensors(CC, s, cin(24.2f, 86.0f, t));  // above setpoint: stop heating
    t += 100;
  }
  // Rapid cycling should not trigger lockout (heater has not been ON continuously long enough)
  CHECK(!s.heater_lockout);
}

static void test_climate_heater_and_humidifier_interaction() {
  ba::ClimateState s = ba::climateInit(0);
  uint32_t t = 2000;
  // Both should OFF independently when their targets are reached
  ba::climateStepSensors(CC, s, cin(20.0f, 80.0f, t));
  CHECK(s.heater && s.humidifier);
  // Reach temp target but miss humidity
  ba::climateStepSensors(CC, s, cin(24.2f, 80.0f, t += 1000));
  CHECK(!s.heater && s.humidifier);         // heater OFF, humidifier ON
  // Reach humidity target but temp rises
  ba::climateStepSensors(CC, s, cin(24.2f, 86.1f, t += 1000));
  CHECK(!s.heater && !s.humidifier);        // both OFF
  // Recover: both reactivate independently
  ba::climateStepSensors(CC, s, cin(23.0f, 80.0f, t += 1000));
  CHECK(s.heater && s.humidifier);
}

static void test_irrigation_co2_invalid_forces_fan_off() {
  ba::IrrigationConfig IC = {45.0f, 50.0f, 60UL * 1000, 10UL * 60 * 1000,
                             1200UL, 1000UL};
  ba::IrrigationState s = {};
  // CO2 below ON threshold with valid sensor: fan OFF
  ba::irrigationStep(IC, s, iin(true, 50.0f, true, 1100, 5000));
  CHECK(!s.fan);
  // CO2 above ON threshold with valid sensor: fan ON
  ba::irrigationStep(IC, s, iin(true, 50.0f, true, 1250, 6000));
  CHECK(s.fan);
  // CO2 becomes invalid (sensor stale or error): fan forced OFF
  ba::irrigationStep(IC, s, iin(true, 50.0f, false, 1250, 7000));
  CHECK(!s.fan);
  // Even with high CO2, invalid sensor keeps fan OFF
  ba::irrigationStep(IC, s, iin(true, 50.0f, false, 2000, 8000));
  CHECK(!s.fan);
}

int main() {
  test_helpers();
  test_climate_normal();
  test_climate_failsafe_on_sensor_loss();
  test_climate_overtemp_latch();
  test_climate_heater_max_on_and_lockout();
  test_climate_humidifier_max_on_and_lockout();
  test_climate_purge_non_blocking();
  test_climate_rapid_cycling();
  test_climate_heater_and_humidifier_interaction();
  test_irrigation_initialization();
  test_irrigation_co2_invalid_forces_fan_off();
  test_irrigation_pump();
  test_irrigation_pump_max_run();
  test_irrigation_fan_and_invalid_co2();
  test_irrigation_moisture_invalid_adc_rail();
  test_climate_purge_survives_sensor_loss();
  test_climate_recovery_from_extended_fault();
  test_climate_boundary_values();
  test_irrigation_pump_lockout_edge_case();
  printf("%d checks, %d failed\n", g_run, g_fail);
  return g_fail ? 1 : 0;
}
