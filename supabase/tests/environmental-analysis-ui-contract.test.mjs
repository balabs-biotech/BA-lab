// Static contract for the Green Tech environmental analysis UI.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../../batch-tracker/environmental-data.js", import.meta.url), "utf8");
assert.match(source, /id:"envAltitude"/, "the UI must expose a verified altitude input");
assert.match(source, /select\("id,code,name,latitude,longitude,altitude_m,coordinate_accuracy_m,coordinate_source"\)/, "location list must load altitude");
assert.match(source, /select\("latitude,longitude,altitude_m,coordinate_accuracy_m,coordinate_source"\)/, "selected location must load altitude");
assert.match(source, /update\(\{altitude_m:value\}\)/, "altitude must be saved to the location record");
assert.match(source, /select\("altitude_m"\)\.eq\("id",location\.value\)/, "analysis must verify the persisted site altitude");
assert.match(source, /Number\(site\.altitude_m\)!==Number\(altitude\.value\)/, "unsaved or stale altitude must block analysis");
assert.match(source, /id:"environmentalAnalysisPanel"/, "the analysis panel must be present");
assert.match(source, /functions\.invoke\("environmental-analysis"/, "the UI must call the authenticated environmental analysis gateway");
assert.match(source, /const weatherReady=await importWeather\(false\)/, "analysis must wait for weather cache validation");
assert.match(source, /if\(!weatherReady\)throw new Error/, "analysis must stop when weather import or cache validation fails");
assert.match(source, /if\(!data\?\.ok\)return false/, "weather import must report unsuccessful provider responses to callers");
assert.match(source, /return true;\s*\}catch\(error\).*return false/s, "weather import must return an explicit success/failure result");
assert.match(source, /indicator\.coverage/, "indicator coverage must be rendered");
assert.match(source, /indicator\.quality/, "indicator quality must be rendered");
assert.match(source, /analysis\.source_summary/, "source provenance summary must be rendered");
assert.match(source, /analysis\.warnings/, "scientific warnings must be visible");
console.log("PASS: Green Tech environmental analysis UI contract");
