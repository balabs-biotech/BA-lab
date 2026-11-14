// SPDX-License-Identifier: MIT
// Pure fail-closed validator for the single supported QC -> BIE dependency edge.
export function matchesSingleUpstreamQcArtifact(upstreamArtifacts, workerResult, stable) {
  if (!Array.isArray(upstreamArtifacts) || upstreamArtifacts.length !== 1) return false;
  if (!workerResult || workerResult.status !== "completed" || typeof stable !== "function") return false;

  const expected = upstreamArtifacts[0];
  const consumed = workerResult.result?.value?.environmental_quality_control;
  if (!expected || !consumed || typeof consumed !== "object" || Array.isArray(consumed)) return false;
  if (!expected.result || typeof expected.result !== "object") return false;

  return consumed.upstream_execution_id === expected.execution_id &&
    consumed.upstream_result_id === expected.result_id &&
    consumed.upstream_engine_id === expected.engine_id &&
    consumed.upstream_engine_version === expected.engine_version &&
    consumed.upstream_completed_at === expected.completed_at &&
    consumed.upstream_input_snapshot_sha256 === expected.input_snapshot_sha256 &&
    stable(consumed.upstream_scope) === stable(expected.scope) &&
    consumed.artifact_sha256 === expected.artifact_sha256 &&
    consumed.outcome === expected.result.outcome &&
    stable(consumed.quality_flags) === stable(expected.result.quality_flags) &&
    stable(consumed.limitations) === stable(expected.result.limitations) &&
    stable(consumed.provenance) === stable(expected.result.provenance) &&
    stable(consumed.value) === stable(expected.result.value);
}
