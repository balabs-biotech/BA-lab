# Biological recommendation resolution v1

## Purpose

Separate a biological/environmental finding from a proposed operational response. A `DomainSignal` reports an interpretation produced by an explicit domain profile. A `RecommendationProposal` is a separate, versioned proposal resolved from that signal and a recommendation definition in the same profile.

## Contract

Each `RecommendationDefinition` declares:
- a stable `recommendation_code`;
- an instruction code and rationale code (content is resolved by the consuming product/catalogue);
- the signal codes to which it applies;
- the finding statuses it accepts;
- required context tags;
- contraindicated context tags.

The resolver requires an exact match between the interpretation and profile ID, version and domain. It then checks each signal's own profile identity, recommendation code, signal code, finding status and context tags.

## Fail-closed behavior

A proposal is withheld when:
- the recommendation definition is missing;
- the signal's profile identity/version/domain does not match;
- the signal code is not applicable;
- the finding status is not allowed;
- any required context tag is absent;
- any contraindicated context tag is present.

Withholding reasons are machine-readable. A missing definition never falls back to a generic instruction.

## Safety and scope

- Proposals always require human review.
- `auto_execute` is structurally fixed to `false`.
- The resolver does not contain biological thresholds, infer actions from raw measurements, or operate equipment.
- The resolver does not claim causal proof. Its rationale code links the proposal to the profile's declared interpretation.
- The resolver is a pure domain-layer operation. This increment does not persist proposals, dispatch notifications, or connect to actuators.
- Recommendation text should live in a separately reviewed, localized catalogue. The engine emits stable codes, not user-facing prose.
- Any profile change, including recommendation applicability or contraindications, requires a new profile version.

## Example boundary

A temperature signal for a declared fruiting-room context may resolve to an inspection proposal only when the profile explicitly maps that signal and the required cultivation-stage/system tags are present. If a contraindication such as an active maintenance state is present, the proposal is withheld. The engine does not decide a target temperature or automatically increase ventilation/humidity.
