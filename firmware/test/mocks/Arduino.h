// Minimal host-side stand-in for Arduino.h, used ONLY for `g++ -fsyntax-only`
// of the node sources. It is NOT the real ESP32 core: it checks that our code is
// self-consistent against the API we assume, not against the real libraries.
#pragma once
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#define HIGH 1
#define LOW 0
#define INPUT 0
#define OUTPUT 1
#define F(x) (x)
void pinMode(uint8_t, uint8_t);
void digitalWrite(uint8_t, uint8_t);
int analogRead(uint8_t);
uint32_t millis();
void delay(uint32_t);
struct SerialMock {
  void begin(unsigned long);
  void println(const char*);
  void printf(const char*, ...) __attribute__((format(printf, 2, 3)));
};
extern SerialMock Serial;
void setup();
void loop();
