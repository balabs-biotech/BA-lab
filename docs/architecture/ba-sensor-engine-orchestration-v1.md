# Sensor Engine — orchestration boundary v1

The `run_sensor_analysis` use case composes the existing read-only Supabase
sensor repository with the descriptive Sensor Engine. It is dependency-injected:
the use case never creates a Supabase client, reads credentials, or performs
authorization itself.

The repository must enforce organization, physical environment, sensor binding,
profile validity and source provenance. The use case independently checks every
returned row's tenant and physical environment identity before computation.

Calendar boundaries are interpreted in the resolved profile's IANA timezone,
then converted to a half-open UTC interval. This avoids assuming that a local
calendar day always begins at UTC midnight.

This is intentionally not yet an HTTP endpoint or a deployed workflow. The
private API boundary and authenticated Supabase gateway still need a dedicated
sensor route before this use case can be invoked by CultureOps. The NASA POWER
endpoint remains unchanged and cannot accept sensor observations.
