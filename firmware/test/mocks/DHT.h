#pragma once
#include <stdint.h>
#define DHT22 22
struct DHT {
  DHT(uint8_t, uint8_t);
  void begin();
  float readTemperature();
  float readHumidity();
};
