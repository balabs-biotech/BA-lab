// SPDX-License-Identifier: MIT
// Device-token authenticated ingestion for registered ESP32 nodes.
// The device token is random, revocable, and stored only as SHA-256 in Supabase.
// No Supabase service-role credential is sent to the device.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

const MAX_PAYLOAD_BYTES = 32_000;

const allowed: Record<string, { unit: string; min: number; max: number }> = {
  temperature: { unit: "degC", min: -20, max: 80 },
  relative_humidity: { unit: "%", min: 0, max: 100 },
  substrate_moisture: { unit: "%", min: 0, max: 100 },
  co2_concentration: { unit: "ppm", min: 0, max: 10000 },
};

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return response(405, { error: "method_not_allowed" });

  const auth = req.headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer\s+([A-Za-z0-9._~-]{32,200})$/i);
  if (!match) return response(401, { error: "device_token_required" });

  const contentLength = req.headers.get("content-length");
  if (contentLength !== null && /^\d+$/.test(contentLength) &&
      Number(contentLength) > MAX_PAYLOAD_BYTES) {
    return response(413, { error: "payload_too_large" });
  }

  // Enforce the limit while streaming, before buffering an untrusted body in memory.
  let raw: string;
  const reader = req.body?.getReader();
  if (!reader) return response(400, { error: "invalid_body" });
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_PAYLOAD_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // The payload is already rejected; cancellation failure must not change the response.
        }
        return response(413, { error: "payload_too_large" });
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return response(400, { error: "invalid_body" });
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return response(400, { error: "invalid_json" });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return response(400, { error: "invalid_payload" });
  }
  if (typeof body.message_id !== "string" || !/^[A-Za-z0-9._:-]{1,120}$/.test(body.message_id)) {
    return response(400, { error: "invalid_message_id" });
  }
  if (!Array.isArray(body.readings) || body.readings.length < 1 || body.readings.length > 20) {
    return response(400, { error: "invalid_readings_count" });
  }

  const now = Date.now();
  for (const reading of body.readings) {
    if (!reading || typeof reading !== "object" || Array.isArray(reading)) {
      return response(400, { error: "invalid_reading" });
    }
    const rule = allowed[reading.variable_code];
    if (!rule || reading.unit_code !== rule.unit) {
      return response(422, { error: "unsupported_variable_or_unit" });
    }
    if (typeof reading.value !== "number" || !Number.isFinite(reading.value) ||
        reading.value < rule.min || reading.value > rule.max) {
      return response(422, { error: "value_out_of_range" });
    }
    if (reading.measured_at !== undefined) {
      if (typeof reading.measured_at !== "string") return response(400, { error: "invalid_timestamp" });
      const ts = Date.parse(reading.measured_at);
      if (!Number.isFinite(ts) || ts < now - 30 * 24 * 60 * 60 * 1000 || ts > now + 10 * 60 * 1000) {
        return response(422, { error: "timestamp_out_of_range" });
      }
    }
    for (const field of ["instrument", "method", "sensor_label"]) {
      if (reading[field] !== undefined &&
          (typeof reading[field] !== "string" || reading[field].length > 120)) {
        return response(400, { error: "invalid_reading_metadata" });
      }
    }
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    console.error("[iot-ingest] Missing Supabase server configuration");
    return response(500, { error: "server_configuration_error" });
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const tokenHash = await sha256Hex(match[1]);
    const { data: device, error: deviceError } = await supabase
      .from("iot_devices")
      .select("id, enabled")
      .eq("token_sha256", tokenHash)
      .eq("enabled", true)
      .maybeSingle();

    if (deviceError) {
      console.error("[iot-ingest] Device lookup failed", deviceError.message);
      return response(500, { error: "device_lookup_failed" });
    }
    if (!device) return response(401, { error: "invalid_or_revoked_device_token" });

    const { data: withinRateLimit, error: rateLimitError } = await supabase.rpc(
      "allow_iot_ingest_request",
      { p_device_id: device.id },
    );
    if (rateLimitError) {
      console.error("[iot-ingest] Rate-limit check failed", rateLimitError.message);
      return response(500, { error: "rate_limit_check_failed" });
    }
    if (withinRateLimit !== true) {
      return response(429, { error: "device_rate_limit_exceeded" });
    }

    const payloadHash = await sha256Hex(raw);
    const { data, error } = await supabase.rpc("ingest_iot_payload", {
      p_device_id: device.id,
      p_message_id: body.message_id,
      p_payload_sha256: payloadHash,
      p_readings: body.readings,
    });

    if (error) {
      const message = error.message ?? "";
      if (message.includes("message_id_payload_mismatch")) {
        return response(409, { error: "message_id_reused_with_different_payload" });
      }
      if (message.includes("unsupported_variable_unit_or_range")) {
        return response(422, { error: "unsupported_variable_unit_or_range" });
      }
      if (message.includes("device_disabled_or_missing")) {
        return response(401, { error: "invalid_or_revoked_device_token" });
      }
      if (message.includes("22023") || message.includes("invalid_")) {
        return response(422, { error: "payload_rejected" });
      }
      console.error("[iot-ingest] Atomic ingestion failed", message);
      return response(500, { error: "ingestion_failed" });
    }

    return response(200, data ?? { status: "processed" });
  } catch (error) {
    console.error("[iot-ingest] Unexpected failure", error instanceof Error ? error.message : "unknown");
    return response(500, { error: "internal_error" });
  }
});
