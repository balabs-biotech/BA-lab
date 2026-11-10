# Environmental context contract v1

## Purpose

An environmental context identifies the physical or virtual environment in
which observations are produced. It prevents measurements from a greenhouse,
fruiting chamber, laboratory or outdoor weather feed from being silently
treated as interchangeable.

## Context types

- `outdoor`
- `greenhouse`
- `fruiting_chamber`
- `laboratory`

## Required identity

Each context has immutable UUID identity for the context, organization and
location; a human-readable label; an IANA timezone; a source origin; and an
explicit profile code and version.

The timezone is part of the context metadata. Observation timestamps should
still be stored as timezone-aware instants (normally UTC); the context timezone
is used for local calendar grouping and interpretation, not to erase the
original timestamp offset.

## Observation origins

- `sensor`: requires one or more unique sensor UUIDs.
- `weather_provider`: external gridded weather data; outdoor context only.
- `satellite`: satellite-derived data; outdoor context only.
- `manual`: manually entered data; no sensor IDs may be claimed.

The restriction of gridded provider and satellite origins to outdoor contexts
is deliberate. A gridded weather estimate is not a measurement inside a
greenhouse or fruiting chamber.

## Profiles

`profile_code` and `profile_version` identify a separately governed
configuration. The context model does not hard-code agronomic thresholds.
Profiles can later define sampling expectations, indicator availability,
quality policies and threshold sets, each with its own version.

## Boundaries

This contract is metadata only. It does not create sensors, verify calibration,
persist observations, or claim that a sensor is correctly installed. Sensor
calibration, placement, observation lineage and context-specific threshold
configuration remain separate contracts.

The model is immutable, rejects unknown fields and validates IANA timezone
names. No database writes are performed by this module.
