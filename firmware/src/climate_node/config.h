// SPDX-License-Identifier: MIT
// Copyright (c) 2026 B.A. LAB project
// Climate node configuration. EVERY value here is a provisional default:
// validate against the real chamber, heater and relay board before use.
#pragma once
#include <stdint.h>

// ---- Pins ----
#define PIN_DHT        4    // DHT22 data
#define PIN_RELAY_HEATER 16
#define PIN_RELAY_HUMID  17
#define PIN_RELAY_FAN    18

// ---- Relay polarity ----
// true  = relay board energises when the pin is LOW (most opto-isolated boards)
// false = relay board energises when the pin is HIGH
// VERIFY with a multimeter and NO load connected before the first power-up.
#define RELAY_ACTIVE_LOW true

// ---- Control (provisional) ----
#define TEMP_SETPOINT_C      24.0f
#define TEMP_HYSTERESIS_C     0.5f
#define TEMP_HARD_MAX_C      30.0f   // heater latched OFF at/above this (software limit)
#define HUM_SETPOINT         85.0f
#define HUM_HYSTERESIS        3.0f
#define HEATER_MAX_ON_MS      (30UL * 60UL * 1000UL)  // 30 min continuous, then lockout
#define HEATER_COOLDOWN_MS    ( 5UL * 60UL * 1000UL)
#define HUMIDIFIER_MAX_ON_MS  (20UL * 60UL * 1000UL)  // 20 min continuous, then lockout (prevent water overflow)
#define HUMIDIFIER_COOLDOWN_MS ( 5UL * 60UL * 1000UL)
#define FAULT_AFTER_FAILED_READS 3
#define SENSOR_INTERVAL_MS   2000UL  // DHT22 minimum sampling period is ~2 s

// Timed fresh-air purge. This is a TIMER, not CO2 regulation (no CO2 sensor on this node).
#define PURGE_INTERVAL_MS (5UL * 60UL * 1000UL)
#define PURGE_DURATION_MS (30UL * 1000UL)
