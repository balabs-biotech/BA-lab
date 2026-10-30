// Static authorization contract for the NASA POWER user-triggered importer.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../functions/nasa-power-agroclimate/index.ts", import.meta.url), "utf8");
const locationRead = source.indexOf('.from("locations")');
const membershipRead = source.indexOf('.from("organization_members")');
const adminWrite = source.indexOf('.from("environmental_observations")', source.indexOf("const adminClient"));
assert.match(source, /userClient\.auth\.getUser\(\)/, "caller session must be validated");
assert.ok(locationRead >= 0 && membershipRead > locationRead, "membership must be checked after RLS-scoped location access");
assert.match(source, /\.select\("role"\)[\s\S]*?\.eq\("organization_id", location\.organization_id\)[\s\S]*?\.eq\("user_id", authData\.user\.id\)/, "membership must match the location organization and authenticated user");
assert.match(source, /!\["owner", "admin", "member"\]\.includes\(String\(membership\.role\)\)/, "viewer and unknown roles must be denied");
assert.ok(adminWrite > membershipRead, "privileged observation writes must occur after writer authorization");
assert.match(source, /write_permission_required/, "unauthorized writes must return an explicit 403 contract");
console.log("PASS: NASA POWER writer authorization contract");
