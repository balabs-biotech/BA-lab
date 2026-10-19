// SPDX-License-Identifier: MIT
// Copyright (c) 2026 SARL B.A. LAB
// Irrigation / CO2 node configuration. EVERY value is a provisional default:
// calibrate on the real sensor, substrate and relay board before use.
#pragma once
#include <stdint.h>

// ---- Pins ----
#define PIN_SOIL_MOISTURE 34   // ADC1 (input only)
#define PIN_RELAY_PUMP    25
#define PIN_RELAY_FAN     26
#define PIN_I2C_SDA       21   // SCD4x
#define PIN_I2C_SCL       22

// ---- Relay polarity ----
// true  = relay energises when pin is LOW; false = energises when pin is HIGH.
// VERIFY with a multimeter and NO load connected before the first power-up.
#define RELAY_ACTIVE_LOW true

// ---- Soil moisture (raw ADC, 12 bit) ----
// UNCALIBRATED placeholders. Measure raw values in air (dry) and in water-saturated
// substrate (wet) with the actual sensor, then replace.
#define MOISTURE_RAW_DRY  4095
#define MOISTURE_RAW_WET  1500
// Raw readings within this margin of 0 or 4095 are treated as sensor fault (open/short).
#define ADC_FAULT_MARGIN  10

// ---- Control (provisional) ----
#define MOISTURE_ON_BELOW_PCT  45.0f
#define MOISTURE_OFF_AT_PCT    50.0f
#define PUMP_MAX_RUN_MS   (60UL * 1000UL)        // max continuous pumping
#define PUMP_LOCKOUT_MS   (10UL * 60UL * 1000UL) // forced OFF afterwards
#define CO2_ON_ABOVE_PPM  1200
#define CO2_OFF_AT_PPM    1000

#define SENSOR_INTERVAL_MS 5000UL   // SCD4x periodic mode updates every ~5 s
// A CO2 value older than this is considered invalid (fan forced OFF + alarm).
#define CO2_MAX_AGE_MS     20000UL
