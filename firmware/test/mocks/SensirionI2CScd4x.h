#pragma once
#include <stdint.h>
#include "Wire.h"
struct SensirionI2CScd4x {
  void begin(TwoWireMock&);
  uint16_t stopPeriodicMeasurement();
  uint16_t startPeriodicMeasurement();
  uint16_t readMeasurement(uint16_t& co2, float& temperature, float& humidity);
};
