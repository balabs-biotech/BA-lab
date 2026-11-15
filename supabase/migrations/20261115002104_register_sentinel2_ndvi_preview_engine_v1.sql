
insert into public.engine_registry (
  engine_code, domain, display_name, description,
  contract_version, implementation_version, execution_mode, entrypoint,
  input_schema, output_schema, capabilities, config,
  timeout_seconds, max_attempts, status, health_status
)
values (
  'environmental.sentinel2.ndvi.preview',
  'environmental',
  'Sentinel-2 NDVI Preview',
  'Builds a site-window raster preview from Sentinel-2 L2A public COG assets; masks cloud and shadow classes when the SCL layer is available.',
  '1.0',
  '5',
  'edge_function',
  'earth-search-sentinel2-ndvi-preview',
  '{"type":"object","required":["location_id","date"],"properties":{"location_id":{"type":"string","format":"uuid"},"date":{"type":"string","format":"date"},"mode":{"type":"string","enum":["ndvi","true_color","false_color"]}}}'::jsonb,
  '{"type":"object","properties":{"content_type":{"const":"image/png"},"headers":{"type":"object","properties":{"X-Geo-Bounds":{"type":"string"},"X-Image-Date":{"type":"string"},"X-Image-Source":{"type":"string"},"X-NDVI-Stats":{"type":"string"}}},"binary_body":{"type":"string","contentEncoding":"base64"}}}'::jsonb,
  array['satellite_context','sentinel2_l2a','ndvi_preview','true_color_preview','false_color_preview','scl_cloud_mask'],
  '{"provider":"Earth Search / AWS Open Data","collection":"sentinel-2-l2a","raster_resolution_m":10,"study_window_note":"Approximate 1.1 km window, not parcel boundary","output_content_type":"image/png","persisted_observation":false}'::jsonb,
  90, 2, 'active', 'unknown'
)
on conflict (engine_code) do update
set domain = excluded.domain,
    display_name = excluded.display_name,
    description = excluded.description,
    contract_version = excluded.contract_version,
    implementation_version = excluded.implementation_version,
    execution_mode = excluded.execution_mode,
    entrypoint = excluded.entrypoint,
    input_schema = excluded.input_schema,
    output_schema = excluded.output_schema,
    capabilities = excluded.capabilities,
    config = excluded.config,
    timeout_seconds = excluded.timeout_seconds,
    max_attempts = excluded.max_attempts,
    status = excluded.status,
    updated_at = now();
;
