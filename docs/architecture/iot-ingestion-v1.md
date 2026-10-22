# IoT ingestion contract — v1

Endpoint: `POST /functions/v1/iot-ingest`

The endpoint is public at the network layer but rejects every request without a registered device token. Supabase user JWT verification is intentionally disabled for this function because ESP32 devices use a separate revocable token. The function performs its own token check and uses the service-role credential only server-side.

## Authentication

Send `Authorization: Bearer <device-token>`. Generate a high-entropy random token during trusted provisioning. Store only its lowercase SHA-256 hex digest in `iot_devices.token_sha256`. Never commit the plaintext token or embed a Supabase service-role key in firmware.

## Request

```json
{
  "message_id": "climate-01-boot7-seq000042",
  "readings": [
    {
      "variable_code": "temperature",
      "value": 23.4,
      "unit_code": "degC",
      "measured_at": "2026-10-22T08:00:00Z",
      "instrument": "DHT22",
      "method": "digital_sensor",
      "sensor_label": "incubation_air_temperature"
    },
    {
      "variable_code": "relative_humidity",
      "value": 81.2,
      "unit_code": "%",
      "measured_at": "2026-10-22T08:00:00Z",
      "instrument": "DHT22",
      "method": "digital_sensor",
      "sensor_label": "incubation_air_humidity"
    }
  ]
}
```

## Rules

- 1–20 readings per request; request body limited to 32 kB.
- Message ID must be stable across retries and unique per device.
- A repeated ID with the same raw request body returns `status: duplicate`; reuse with a different payload returns HTTP 409.
- Allowed v1 variable/unit pairs: `temperature/degC`, `relative_humidity/%`, `substrate_moisture/%`, `co2_concentration/ppm`.
- Plausibility bounds: temperature −20..80 °C; relative humidity 0..100%; substrate moisture estimate 0..100%; CO₂ 0..10000 ppm.
- Device timestamps must be ISO-compatible and no more than 30 days old or 10 minutes in the future. If omitted, the database reception time is used.
- Successful readings enter `measurements` with `quality_state='raw'`, plus the registered device and environment IDs. The environment humidity/soil moisture percentages are sensor estimates and must be locally calibrated.
- The SQL RPC performs receipt creation and all measurement inserts in one transaction. A rejected payload leaves no partial measurement batch.
- Responses contain generic error codes only. Detailed server errors stay in server logs.

## Status and limits

This endpoint is deployed, but **no device has been provisioned and no hardware transmission has been verified**. There is no remote actuator-control endpoint. Before provisioning real devices, test token rotation/revocation, retry behavior, timestamps, cross-organization isolation and actual ESP32 network stability.
