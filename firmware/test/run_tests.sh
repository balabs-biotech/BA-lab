#!/bin/sh
# Host-side verification, no hardware and no network needed (needs g++).
#   1. unit tests of the control logic
#   2. syntax/consistency check of both node sources against mock headers
#      (mocks are NOT the real ESP32 core; the real check is `pio run`)
set -eu
cd "$(dirname "$0")/.."
OUT="${TMPDIR:-/tmp}/ba_fw_test"
mkdir -p "$OUT"
FLAGS="-std=gnu++11 -Wall -Wextra -Werror -Ilib/control_logic"

echo "== unit tests"
g++ $FLAGS test/test_control_logic.cpp -o "$OUT/test_control_logic"
"$OUT/test_control_logic"

for node in climate_node irrigation_node; do
  echo "== syntax check: $node"
  g++ $FLAGS -fsyntax-only -Itest/mocks -Isrc/$node src/$node/main.cpp
done
echo "ALL OK"
