import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

type Job = { job_id: string; organization_id: string; engine_code: string; contract_version: string; payload: Record<string, unknown>; attempt: number; max_attempts: number; lease_token: string; };
type Engine = { engine_code: string; contract_version: string; execution_mode: string; entrypoint: string | null; status: string; timeout_seconds: number; };

function constantTimeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  const size = Math.max(left.length, right.length);
  for (let i = 0; i < size; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}


function interpretMycology(input: Record<string, unknown>, profile: Record<string, unknown>) {
  if (typeof input.culture_id !== "string" || !input.culture_id) throw new Error("culture_id_required");
  if (!Array.isArray(input.observations)) throw new Error("observations_array_required");
  const observations = input.observations.filter((x) => x && typeof x === "object" && !Array.isArray(x)) as Record<string, unknown>[];
  const findings: Record<string, unknown>[] = [];
  const evidence: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let quality = 1;

  if (observations.length === 0) {
    findings.push({ code: "no_observations", severity: "information" });
    quality = 0;
  }

  const series = new Map<string, { value: number; unit: string; at: number }[]>();
  observations.forEach((o, index) => {
    const variable = String(o.variable ?? o.parameter ?? o.metric ?? "unknown").trim().toLowerCase();
    const value = o.value ?? null;
    const unit = typeof o.unit === "string" ? o.unit.trim() : "";
    const timestamp = o.observed_at ?? o.timestamp ?? o.recorded_at ?? null;
    const at = Date.parse(String(timestamp ?? ""));
    const key = [variable, String(value), unit, String(timestamp)].join("|");

    if (seen.has(key)) { findings.push({ code: "duplicate_observation", severity: "warning", observation_index: index }); quality -= 0.08; }
    seen.add(key);
    if (variable === "unknown") { findings.push({ code: "variable_unidentified", severity: "warning", observation_index: index }); quality -= 0.08; }
    if (!Number.isFinite(at)) { findings.push({ code: "timestamp_missing_or_invalid", severity: "warning", observation_index: index }); quality -= 0.12; }
    if (value === null) { findings.push({ code: "value_missing", severity: "warning", observation_index: index }); quality -= 0.12; }
    if (typeof value === "number" && !unit) { findings.push({ code: "unit_missing", severity: "warning", observation_index: index }); quality -= 0.08; }

    evidence.push({ observation_index: index, variable, value, unit: unit || null, observed_at: timestamp, source: o.source ?? o.sensor_id ?? o.method ?? null, quality_flag: o.quality_flag ?? o.quality ?? null });
    if (typeof value === "number" && Number.isFinite(value) && unit && Number.isFinite(at)) {
      const values = series.get(variable) ?? [];
      values.push({ value, unit, at });
      series.set(variable, values);
    }
  });

  for (const [variable, values] of series) {
    const units = new Set(values.map(v => v.unit));
    if (values.length < 2) continue;
    if (units.size > 1) {
      findings.push({ code: "incompatible_units", severity: "warning", variable, units: [...units] });
      quality -= 0.15;
      continue;
    }
    values.sort((a,b) => a.at-b.at);
    const delta = values[values.length-1].value-values[0].value;
    findings.push({
      code: "observed_trend", severity: "information", variable,
      direction: delta > 0 ? "increasing" : delta < 0 ? "decreasing" : "stable",
      delta, unit: values[0].unit, sample_count: values.length,
      interval_start: new Date(values[0].at).toISOString(),
      interval_end: new Date(values[values.length-1].at).toISOString(),
      interpretation_limit: "Descriptive only; no causal or optimal biological inference."
    });
  }

  if (findings.length === 0) findings.push({ code: "no_structural_anomaly_detected", severity: "information" });
  const confidence = Math.max(0, Math.min(1, quality)) * (observations.length >= 3 ? 1 : observations.length === 2 ? 0.85 : observations.length === 1 ? 0.65 : 0.2);
  return {
    status: "interpreted", domain: "mycology", culture_id: input.culture_id,
    profile: { id: profile.id, code: profile.profile_code, version: profile.profile_version },
    findings, evidence, confidence: Number(confidence.toFixed(3)),
    confidence_basis: "Data completeness, timestamps, units and observation count; not a probability of biological success.",
    limitations: [
      "No species- or strain-specific thresholds are applied by this generic profile.",
      "Observed trends are descriptive and do not establish causality.",
      "Culture recommendations require a validated biological profile and contextualized observations."
    ],
    interpreted_at: new Date().toISOString()
  };
}

function normalizeMeasurementQuality(value: unknown) {
  const state = String(value ?? "raw").toLowerCase();
  if (state === "raw") return "observed";
  if (state === "controlled" || state === "validated") return "validated";
  if (state === "excluded") return "excluded";
  return state;
}

function deriveDescriptiveSeries(observations: Record<string, unknown>[]) {
  const grouped = new Map<string, { value: number; unit: string; at: number; source: unknown }[]>();
  for (const observation of observations) {
    const variable = String(observation.variable ?? observation.parameter ?? observation.metric ?? "").trim().toLowerCase();
    const value = observation.value;
    const unit = String(observation.unit ?? "").trim();
    const quality = normalizeMeasurementQuality(observation.quality_state ?? observation.quality_flag ?? observation.quality ?? "observed");
    const timestamp = observation.observed_at ?? observation.timestamp ?? observation.recorded_at;
    const at = Date.parse(String(timestamp ?? ""));
    if (!variable || typeof value !== "number" || !Number.isFinite(value) || !unit ||
        !Number.isFinite(at) || !["observed","validated"].includes(quality)) continue;
    const bucket = grouped.get(variable) ?? [];
    bucket.push({ value, unit, at, source: observation.measurement_id ?? observation.environmental_observation_id ?? observation.source ?? null });
    grouped.set(variable, bucket);
  }
  const derived: Record<string, unknown>[] = [];
  for (const [variable, points] of grouped) {
    const units = [...new Set(points.map(point => point.unit))];
    if (points.length < 2 || units.length !== 1) continue;
    points.sort((a,b) => a.at-b.at);
    const first = points[0], last = points[points.length-1];
    const elapsedHours = (last.at-first.at)/3600000;
    const values = points.map(point => point.value);
    const delta = last.value-first.value;
    derived.push({
      metric_code: variable + "_series_summary",
      method: "observed_time_series_summary_v1",
      status: "descriptive",
      unit: first.unit,
      sample_count: points.length,
      minimum: Math.min(...values), maximum: Math.max(...values),
      mean: Number((values.reduce((sum,value)=>sum+value,0)/values.length).toFixed(6)),
      first_value: first.value, last_value: last.value, delta,
      direction: delta > 0 ? "increasing" : delta < 0 ? "decreasing" : "stable",
      elapsed_hours: Number(elapsedHours.toFixed(3)),
      rate_per_hour: elapsedHours > 0 ? Number((delta/elapsedHours).toFixed(8)) : null,
      interval_start: new Date(first.at).toISOString(),
      interval_end: new Date(last.at).toISOString(),
      source_observation_refs: points.map(point => point.source).filter(value => value !== null),
      limitation: "Descriptive summary only; no causal, diagnostic or optimum inference."
    });
  }
  return derived;
}


type FormulaInput = Record<string, unknown>;

function executeFormula(implementation: string, values: FormulaInput): { value: number; unit: string; assumptions: string[]; limitations: string[]; diagnostics?: Record<string, unknown> } {
  const number = (key: string, minExclusive = false): number => {
    const value = values[key];
    if (typeof value !== "number" || !Number.isFinite(value) || (minExclusive ? value <= 0 : value < 0)) {
      throw new Error("invalid_formula_input:" + key);
    }
    return value;
  };
  switch (implementation) {
    case "cfu_per_ml_v1": {
      if (values.plate_countability !== "countable") {
        throw new Error("cfu_requires_explicit_countable_plate_assessment");
      }
      const colonies = number("colony_count");
      const dilution = number("dilution_factor", true);
      const volume = number("plated_volume_ml", true);
      return { value: colonies * dilution / volume, unit: "CFU/mL",
        assumptions: ["The operator explicitly classified this plate as countable", "Dilution factor is the reciprocal of the plated suspension dilution", "Plated volume is in mL", "The result estimates the original suspension concentration represented by this plate"],
        limitations: ["No universal countable-colony interval is imposed; countability follows the documented method or validated laboratory SOP", "A single plate does not estimate between-plate or dilution-series uncertainty", "Replicate plates remain separate unless explicitly summarized", "The result is not a species identification or purity assessment"] };
    }
    case "biological_efficiency_v1": {
      const yieldG = number("cumulative_fresh_yield_g");
      const dryG = number("initial_dry_substrate_mass_g", true);
      return { value: 100 * yieldG / dryG, unit: "%",
        assumptions: ["Cumulative fresh yield and initial dry substrate mass refer to the same batch and defined harvest scope"],
        limitations: ["Comparisons require consistent substrate mass basis and harvest scope", "This metric does not predict future yield"] };
    }
    case "difference_over_elapsed_time_v1": {
      const initial = number("initial_height_mm");
      const final = number("final_height_mm");
      const days = number("elapsed_days", true);
      return { value: (final - initial) / days, unit: "mm/day",
        assumptions: ["Both measurements use the same protocol and subject", "Elapsed time is measured in days"],
        limitations: ["Two-point average does not describe nonlinear growth between measurements", "Replicates must not be silently pooled"] };
    }
    case "log_growth_rate_v1": {
      const initial = number("initial_value", true);
      const final = number("final_value", true);
      const hours = number("elapsed_hours", true);
      return { value: Math.log(final / initial) / hours, unit: "1/h",
        assumptions: ["Both values are positive, comparable and measured in consistent units"],
        limitations: ["Valid only where exponential growth is a defensible model", "OD requires blank correction and instrument linearity checks", "OD alone is not a viable-cell count"] };
    }
    case "greentech_plant_height_curve_regression_v1": {
      const points=values.series_points;
      if(!Array.isArray(points)||points.length<3||points.length>100)
        throw new Error("plant_height_regression_requires_3_to_100_points");
      const parsed=points.map((point,index)=>{
        if(!point||typeof point!=="object"||Array.isArray(point)) throw new Error("invalid_plant_height_point:"+index);
        const p=point as Record<string,unknown>;
        if(typeof p.elapsed_hours!=="number"||!Number.isFinite(p.elapsed_hours)||p.elapsed_hours<0||
           typeof p.height_mm!=="number"||!Number.isFinite(p.height_mm)||p.height_mm<0)
          throw new Error("invalid_plant_height_series_point:"+index);
        return {x:p.elapsed_hours,y:p.height_mm};
      }).sort((a,b)=>a.x-b.x);
      if(parsed.some((p,i)=>i>0&&p.x<=parsed[i-1].x)) throw new Error("plant_height_timestamps_must_be_strictly_increasing");
      const n=parsed.length,mx=parsed.reduce((s,p)=>s+p.x,0)/n,my=parsed.reduce((s,p)=>s+p.y,0)/n;
      const sxx=parsed.reduce((s,p)=>s+(p.x-mx)**2,0);
      if(!(sxx>0)) throw new Error("plant_height_elapsed_time_variance_zero");
      const slopeHour=parsed.reduce((s,p)=>s+(p.x-mx)*(p.y-my),0)/sxx;
      const intercept=my-slopeHour*mx;
      const sse=parsed.reduce((s,p)=>s+(p.y-(intercept+slopeHour*p.x))**2,0);
      const sst=parsed.reduce((s,p)=>s+(p.y-my)**2,0);
      return {value:slopeHour*24,unit:"mm/day",
        assumptions:["At least three measurements describe the same plant or explicitly defined experimental unit","Measurements use one height protocol, one instrument and canonical millimetre units","Ordinary least-squares slope describes the selected observation interval"],
        limitations:["A linear trend does not establish plant health, treatment efficacy or causal response","Seasonal, developmental and stress-related growth changes may make one slope misleading","Replicates, plant organs and plots must not be silently pooled","Outliers are retained and reflected in residual diagnostics"],
        diagnostics:{point_count:n,intercept_mm:intercept,r_squared:sst>0?1-sse/sst:null,residual_sum_squares_mm2:sse,slope_mm_per_day:slopeHour*24,elapsed_hours:[parsed[0].x,parsed[n-1].x]}};
    }
    case "lab_od600_piecewise_growth_regimes_v1": {
      const points=values.series_points;
      if(!Array.isArray(points)||points.length<9||points.length>100)
        throw new Error("od600_piecewise_requires_9_to_100_points");
      const parsed=points.map((point,index)=>{
        if(!point||typeof point!=="object"||Array.isArray(point)) throw new Error("invalid_od600_phase_point:"+index);
        const p=point as Record<string,unknown>;
        if(typeof p.elapsed_hours!=="number"||!Number.isFinite(p.elapsed_hours)||p.elapsed_hours<0||
           typeof p.blank_corrected_od600!=="number"||!Number.isFinite(p.blank_corrected_od600)||p.blank_corrected_od600<=0)
          throw new Error("invalid_positive_blank_corrected_od600_point:"+index);
        return {x:p.elapsed_hours,y:Math.log(p.blank_corrected_od600)};
      }).sort((a,b)=>a.x-b.x);
      if(parsed.some((p,i)=>i>0&&p.x<=parsed[i-1].x)) throw new Error("od600_phase_timestamps_must_be_strictly_increasing");
      const fit=(segment:{x:number;y:number}[])=>{
        const n=segment.length,mx=segment.reduce((s,p)=>s+p.x,0)/n,my=segment.reduce((s,p)=>s+p.y,0)/n;
        const sxx=segment.reduce((s,p)=>s+(p.x-mx)**2,0);
        if(!(sxx>0)) throw new Error("od600_phase_segment_time_variance_zero");
        const slope=segment.reduce((s,p)=>s+(p.x-mx)*(p.y-my),0)/sxx,intercept=my-slope*mx;
        const sse=segment.reduce((s,p)=>s+(p.y-(intercept+slope*p.x))**2,0);
        return {slope,intercept,sse};
      };
      const n=parsed.length;
      let best:{a:number;b:number;fits:ReturnType<typeof fit>[];sse:number}|null=null;
      for(let a=3;a<=n-6;a++) for(let b=a+3;b<=n-3;b++) {
        const fits=[fit(parsed.slice(0,a)),fit(parsed.slice(a,b)),fit(parsed.slice(b))];
        const sse=fits.reduce((sum,f)=>sum+f.sse,0);
        if(!best||sse<best.sse) best={a,b,fits,sse};
      }
      if(!best) throw new Error("od600_piecewise_no_valid_partition");
      const slopes=best.fits.map(f=>f.slope),maxSlope=Math.max(...slopes,0);
      const segments=[
        {start:0,end:best.a-1},{start:best.a,end:best.b-1},{start:best.b,end:n-1}
      ].map((seg,i)=>{
        const f=best!.fits[i],start=parsed[seg.start],end=parsed[seg.end];
        let candidate="intermediate_growth_regime";
        if(f.slope<=0) candidate="non_positive_net_growth_regime";
        else if(maxSlope>0&&f.slope<=maxSlope*0.1) candidate=i===0?"lag_like_low_slope_candidate":"stationary_or_slowdown_candidate";
        else if(f.slope===maxSlope) candidate="highest_observed_specific_growth_candidate";
        return {candidate,start_hour:start.x,end_hour:end.x,duration_hours:end.x-start.x,
          point_count:seg.end-seg.start+1,specific_growth_rate_candidate_per_h:f.slope,
          residual_sum_squares:f.sse};
      });
      const full=fit(parsed),improvement=full.sse>0?1-best.sse/full.sse:0;
      return {value:3,unit:"count",
        assumptions:["Blank-corrected positive OD600 values are transformed using natural logarithm","Three contiguous linear regimes are estimated by exhaustive two-breakpoint search","All points represent one sample, experimental unit, method and instrument"],
        limitations:["Regimes are statistical candidates, not confirmed microbial lag, exponential or stationary phases","OD600 is turbidity and does not directly measure viable cells","Aggregation, morphology, oxygen limitation, instrument saturation and dilution changes can distort OD600","Piecewise fitting can overfit noisy or sparse series; no automatic outlier removal"],
        diagnostics:{point_count:n,segments,breakpoint_hours:[parsed[best.a].x,parsed[best.b].x],
          combined_residual_sum_squares:best.sse,single_log_linear_residual_sum_squares:full.sse,
          relative_sse_improvement:improvement,model:"three_segment_piecewise_ols_ln_od600"}};
    }
    case "log_linear_regression_growth_rate_v1": {
      const points = values.series_points;
      if (!Array.isArray(points) || points.length < 3 || points.length > 100) {
        throw new Error("log_linear_regression_requires_3_to_100_points");
      }
      const parsed = points.map((point, index) => {
        if (!point || typeof point !== "object" || Array.isArray(point)) throw new Error("invalid_series_point:" + index);
        const p = point as Record<string, unknown>;
        if (typeof p.elapsed_hours !== "number" || !Number.isFinite(p.elapsed_hours) || p.elapsed_hours < 0 ||
            typeof p.blank_corrected_od600 !== "number" || !Number.isFinite(p.blank_corrected_od600) || p.blank_corrected_od600 <= 0) {
          throw new Error("invalid_blank_corrected_od600_series_point:" + index);
        }
        return { x: p.elapsed_hours, y: Math.log(p.blank_corrected_od600) };
      });
      parsed.sort((a,b) => a.x-b.x);
      if (parsed.some((p,i) => i > 0 && p.x <= parsed[i-1].x)) throw new Error("series_timestamps_must_be_strictly_increasing");
      const n = parsed.length;
      const meanX = parsed.reduce((s,p)=>s+p.x,0)/n;
      const meanY = parsed.reduce((s,p)=>s+p.y,0)/n;
      const sxx = parsed.reduce((s,p)=>s+(p.x-meanX)**2,0);
      if (!(sxx > 0)) throw new Error("series_elapsed_time_variance_zero");
      const slope = parsed.reduce((s,p)=>s+(p.x-meanX)*(p.y-meanY),0)/sxx;
      const intercept = meanY-slope*meanX;
      const residuals = parsed.map(p=>p.y-(intercept+slope*p.x));
      const sse = residuals.reduce((s,v)=>s+v*v,0);
      const sst = parsed.reduce((s,p)=>s+(p.y-meanY)**2,0);
      const rSquared = sst > 0 ? 1-sse/sst : null;
      if (!(slope > 0) || !Number.isFinite(slope)) throw new Error("estimated_specific_growth_rate_not_positive");
      return { value: slope, unit: "1/h",
        assumptions: ["At least three positive blank-corrected OD600 points were measured on one sample and experimental unit", "Ordinary least-squares regression of ln(OD600) against elapsed hours", "All measurements use one method, one instrument and one canonical OD600 unit"],
        limitations: ["A high R-squared does not establish biological exponential growth or validate the measurement method", "OD600 is turbidity, not viable-cell concentration", "Lag phase, stationary phase, aggregation and instrument saturation require domain review", "The estimate applies only to the selected time interval"],
        diagnostics: { point_count: n, intercept, r_squared: rSquared, residual_sum_squares: sse, elapsed_hours: [parsed[0].x, parsed[n-1].x] } };
    }
    case "generation_time_v1": {
      const mu = number("specific_growth_rate_1_per_h", true);
      return { value: Math.LN2 / mu, unit: "h",
        assumptions: ["Specific growth rate is positive and expressed in h^-1"],
        limitations: ["Valid only for an interval where exponential growth is representative", "An OD-derived rate is not a direct viable-cell growth measurement"] };
    }
    case "colony_diameter_rate_v1": {
      const initial = number("initial_diameter_mm");
      const final = number("final_diameter_mm");
      const days = number("elapsed_days", true);
      return { value: (final - initial) / days, unit: "mm/day",
        assumptions: ["Both diameters refer to the same culture, axis and measurement method", "Elapsed time is derived from actual timestamps"],
        limitations: ["Two-point mean rate does not represent the full growth curve", "This is linear diameter change, not radial extension rate", "Replicates and axes must remain separately identifiable"] };
    }
    case "mycology_piecewise_growth_phases_v1": {
      const points = values.series_points;
      if (!Array.isArray(points) || points.length < 9 || points.length > 100)
        throw new Error("piecewise_growth_model_requires_9_to_100_points");
      const parsed = points.map((point,index) => {
        if (!point || typeof point !== "object" || Array.isArray(point)) throw new Error("invalid_phase_point:"+index);
        const p=point as Record<string,unknown>;
        if (typeof p.elapsed_hours !== "number" || !Number.isFinite(p.elapsed_hours) || p.elapsed_hours < 0 ||
            typeof p.diameter_mm !== "number" || !Number.isFinite(p.diameter_mm) || p.diameter_mm < 0)
          throw new Error("invalid_phase_curve_point:"+index);
        return {x:p.elapsed_hours,y:p.diameter_mm};
      }).sort((a,b)=>a.x-b.x);
      if (parsed.some((p,i)=>i>0 && p.x<=parsed[i-1].x)) throw new Error("phase_curve_timestamps_must_be_strictly_increasing");
      const fit = (segment: {x:number;y:number}[]) => {
        const n=segment.length, mx=segment.reduce((s,p)=>s+p.x,0)/n, my=segment.reduce((s,p)=>s+p.y,0)/n;
        const sxx=segment.reduce((s,p)=>s+(p.x-mx)**2,0);
        if (!(sxx>0)) throw new Error("phase_segment_time_variance_zero");
        const slope=segment.reduce((s,p)=>s+(p.x-mx)*(p.y-my),0)/sxx;
        const intercept=my-slope*mx;
        const sse=segment.reduce((s,p)=>s+(p.y-(intercept+slope*p.x))**2,0);
        return {slope,intercept,sse};
      };
      const n=parsed.length;
      let best:{a:number;b:number;fits:ReturnType<typeof fit>[];sse:number}|null=null;
      for(let a=3;a<=n-6;a++) for(let b=a+3;b<=n-3;b++) {
        const fits=[fit(parsed.slice(0,a)),fit(parsed.slice(a,b)),fit(parsed.slice(b))];
        const sse=fits.reduce((s,f)=>s+f.sse,0);
        if(!best || sse<best.sse) best={a,b,fits,sse};
      }
      if(!best) throw new Error("piecewise_growth_model_no_valid_partition");
      const slopes=best.fits.map(f=>f.slope);
      const maxAbs=Math.max(...slopes.map(Math.abs),1e-9);
      const segments=[
        {label:"early_regime_candidate",start_index:0,end_index:best.a-1},
        {label:"middle_regime_candidate",start_index:best.a,end_index:best.b-1},
        {label:"late_regime_candidate",start_index:best.b,end_index:n-1}
      ].map((segment,i)=>{
        const start=parsed[segment.start_index],end=parsed[segment.end_index],f=best!.fits[i];
        const phaseLabel=Math.abs(f.slope)<=maxAbs*0.1 ? "plateau_like"
          : f.slope<0 ? "negative_diameter_change"
          : i>0 && f.slope<slopes[i-1]*0.7 ? "slower_extension"
          : i>0 && f.slope>slopes[i-1]*1.3 ? "faster_extension"
          : "positive_extension";
        return {...segment,candidate:phaseLabel,slope_mm_per_day:f.slope*24,
          duration_hours:end.x-start.x,from_hour:start.x,to_hour:end.x,
          point_count:segment.end_index-segment.start_index+1,residual_sum_squares:f.sse};
      });
      const single=fit(parsed);
      const improvement=single.sse>0 ? 1-best.sse/single.sse : 0;
      return {value:3,unit:"count",
        assumptions:["Three contiguous linear regimes are fitted independently by exhaustive two-breakpoint search","Each regime contains at least three observations","Input points refer to one culture, one growth axis, one method, one instrument and one experimental unit"],
        limitations:["Regime boundaries are statistical candidates, not biologically confirmed lag, exponential, slowdown or stationary phases","Piecewise linearity is an approximation and can overfit sparse or noisy observations","No automatic outlier removal; interpret with images, substrate, temperature and replicate context"],
        diagnostics:{point_count:n,segments,combined_residual_sum_squares:best.sse,single_line_residual_sum_squares:single.sse,relative_sse_improvement:improvement,breakpoint_hours:[parsed[best.a].x,parsed[best.b].x],model:"three_segment_piecewise_ordinary_least_squares"}};
    }
    case "mycology_diameter_curve_regression_v1": {
      const points = values.series_points;
      if (!Array.isArray(points) || points.length < 3 || points.length > 100)
        throw new Error("mycology_curve_requires_3_to_100_points");
      const parsed = points.map((point,index) => {
        if (!point || typeof point !== "object" || Array.isArray(point)) throw new Error("invalid_curve_point:"+index);
        const p=point as Record<string,unknown>;
        if (typeof p.elapsed_hours !== "number" || !Number.isFinite(p.elapsed_hours) || p.elapsed_hours < 0 ||
            typeof p.diameter_mm !== "number" || !Number.isFinite(p.diameter_mm) || p.diameter_mm < 0)
          throw new Error("invalid_colony_diameter_curve_point:"+index);
        return {x:p.elapsed_hours,y:p.diameter_mm};
      }).sort((a,b)=>a.x-b.x);
      if (parsed.some((p,i)=>i>0 && p.x<=parsed[i-1].x)) throw new Error("curve_timestamps_must_be_strictly_increasing");
      const n=parsed.length, meanX=parsed.reduce((s,p)=>s+p.x,0)/n, meanY=parsed.reduce((s,p)=>s+p.y,0)/n;
      const sxx=parsed.reduce((s,p)=>s+(p.x-meanX)**2,0);
      if (!(sxx>0)) throw new Error("curve_elapsed_time_variance_zero");
      const slope=parsed.reduce((s,p)=>s+(p.x-meanX)*(p.y-meanY),0)/sxx;
      const intercept=meanY-slope*meanX;
      const sse=parsed.reduce((s,p)=>s+(p.y-(intercept+slope*p.x))**2,0);
      const sst=parsed.reduce((s,p)=>s+(p.y-meanY)**2,0);
      const rSquared=sst===0?null:1-sse/sst;
      return {value:slope*24,unit:"mm/day",
        assumptions:["At least three diameter observations share the same culture, axis, method and instrument","OLS slope summarizes the selected interval"],
        limitations:["Linear regression is a descriptive average and does not model lag or plateau phases","Radial extension is half the diameter slope only for approximately circular colonies","No automatic exclusion of outliers"],
        diagnostics:{point_count:n,intercept_mm:intercept,r_squared:rSquared,residual_sum_squares:sse,diameter_slope_mm_per_hour:slope,radial_extension_mm_per_day:slope*12,elapsed_hours:[parsed[0].x,parsed[n-1].x]}};
    }
    default: throw new Error("unsupported_formula_implementation");
  }
}


function finiteMeasurementNumber(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(value));
}

async function buildMeasurementSeriesRequests(admin: ReturnType<typeof createClient>, organizationId: string, domain: string, requests: unknown) {
  if (!Array.isArray(requests)) return [];
  if (requests.length > 25) throw new Error("series_request_limit_exceeded");
  const output: Record<string, unknown>[] = [];
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  for (const raw of requests) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      output.push({ status: "rejected", error: "series_request_must_be_object" }); continue;
    }
    const item = raw as Record<string, unknown>;
    const formulaCode = typeof item.formula_code === "string" ? item.formula_code : "";
    const formulaVersion = typeof item.formula_version === "string" ? item.formula_version : "";
    const variableCode = typeof item.variable_code === "string" ? item.variable_code : "";
    const subjectId = typeof item.subject_id === "string" ? item.subject_id : "";
    if (!uuidPattern.test(subjectId) || !variableCode || !formulaCode || !formulaVersion) {
      output.push({ formula_code: formulaCode || null, status: "rejected", error: "series_request_missing_valid_subject_variable_or_formula" }); continue;
    }
    const subjectColumn = domain === "mycology" ? "culture_id" : domain === "greentech" ? "plant_culture_id" : domain === "lab" ? "sample_id" : null;
    if (!subjectColumn) { output.push({ status: "rejected", error: "series_domain_not_supported" }); continue; }
    const expected = domain === "mycology" ? (formulaCode === "mycology.piecewise_growth_phases" ? "mycology.piecewise_growth_phases" : "mycology.colony_diameter_curve_regression")
      : domain === "greentech" ? (formulaCode === "greentech.plant_height_curve_regression" ? "greentech.plant_height_curve_regression" : "greentech.plant_height_rate")
      : (formulaCode === "lab.od600_piecewise_growth_regimes" ? "lab.od600_piecewise_growth_regimes" : "lab.od600_log_linear_regression");
    const expectedVariable = domain === "mycology" ? "colony_diameter"
      : domain === "greentech" ? "plant_height" : "od600";
    if (formulaCode !== expected || variableCode !== expectedVariable) {
      output.push({ formula_code: formulaCode, status: "rejected", error: "series_formula_variable_domain_mismatch" }); continue;
    }
    const { data: variableDefinition, error: variableError } = await admin.from("variables")
      .select("canonical_unit_code").eq("code", variableCode).maybeSingle();
    if (variableError || !variableDefinition?.canonical_unit_code) {
      output.push({ formula_code: formulaCode, status: "rejected", error: "series_variable_canonical_unit_missing" }); continue;
    }
    let query = admin.from("measurements")
      .select("id,variable_code,raw_value,raw_unit_code,normalized_value,normalized_unit_code,measured_at,method,instrument,quality_state,exclusion_reason,experimental_unit_id,metadata")
      .eq("organization_id", organizationId).eq("variable_code", variableCode)
      .eq(subjectColumn, subjectId).order("measured_at", { ascending: true }).limit(101);
    if (typeof item.observed_since === "string") query = query.gte("measured_at", item.observed_since);
    if (typeof item.observed_until === "string") query = query.lte("measured_at", item.observed_until);
    const { data, error } = await query;
    if (error) throw new Error("measurement_series_lookup_failed:" + error.message);
    const usable = (data ?? []).filter((m: Record<string, unknown>) =>
      ["controlled","validated"].includes(String(m.quality_state).toLowerCase()) &&
      m.exclusion_reason == null &&
      (finiteMeasurementNumber(m.normalized_value) || finiteMeasurementNumber(m.raw_value)) &&
      typeof (m.normalized_unit_code ?? m.raw_unit_code) === "string" &&
      Number.isFinite(Date.parse(String(m.measured_at))));
    if (usable.length > 100) {
      output.push({ formula_code: formulaCode, status: "rejected", error: "series_exceeds_100_measurements_per_request", usable_count: usable.length }); continue;
    }
    if (usable.length < 2) {
      output.push({ formula_code: formulaCode, status: "rejected", error: "series_requires_two_usable_measurements", usable_count: usable.length }); continue;
    }
    const first = usable[0], last = usable[usable.length - 1];
    const firstUnit = String(first.normalized_unit_code ?? first.raw_unit_code);
    const lastUnit = String(last.normalized_unit_code ?? last.raw_unit_code);
    const canonicalUnit = String(variableDefinition.canonical_unit_code);
    if (firstUnit !== canonicalUnit || lastUnit !== canonicalUnit) {
      output.push({ formula_code: formulaCode, status: "rejected", error: "series_noncanonical_unit_requires_normalization", expected_unit: canonicalUnit, received_units: [firstUnit,lastUnit] }); continue;
    }
    if (firstUnit !== lastUnit) {
      output.push({ formula_code: formulaCode, status: "rejected", error: "series_unit_mismatch" }); continue;
    }
    const firstMethod = first.method ?? null, lastMethod = last.method ?? null;
    const firstInstrument = first.instrument ?? null, lastInstrument = last.instrument ?? null;
    const firstExperimentalUnit = first.experimental_unit_id ?? null, lastExperimentalUnit = last.experimental_unit_id ?? null;
    const mixedSeries = usable.some((m: Record<string, unknown>) =>
      (m.method ?? null) !== firstMethod || (m.instrument ?? null) !== firstInstrument ||
      (m.experimental_unit_id ?? null) !== firstExperimentalUnit ||
      String(m.normalized_unit_code ?? m.raw_unit_code) !== canonicalUnit);
    if (mixedSeries || firstMethod !== lastMethod || firstInstrument !== lastInstrument || firstExperimentalUnit !== lastExperimentalUnit) {
      output.push({ formula_code: formulaCode, status: "rejected", error: "series_method_or_instrument_mismatch" }); continue;
    }
    const initial = Number(first.normalized_value ?? first.raw_value);
    const final = Number(last.normalized_value ?? last.raw_value);
    const elapsedHours = (Date.parse(String(last.measured_at)) - Date.parse(String(first.measured_at))) / 3600000;
    if (!(elapsedHours > 0) || !Number.isFinite(initial) || !Number.isFinite(final)) {
      output.push({ formula_code: formulaCode, status: "rejected", error: "series_time_or_value_invalid" }); continue;
    }
    let inputs: Record<string, unknown>;
    if (domain === "mycology") {
      const curve = usable.map((m: Record<string,unknown>) => {
        const metadata = m.metadata && typeof m.metadata === "object" && !Array.isArray(m.metadata)
          ? m.metadata as Record<string,unknown> : {};
        const axis = typeof metadata.growth_axis === "string" ? metadata.growth_axis.trim() : "";
        return { elapsed_hours:(Date.parse(String(m.measured_at))-Date.parse(String(first.measured_at)))/3600000,
          diameter_mm:Number(m.normalized_value ?? m.raw_value), growth_axis:axis, source_measurement_id:String(m.id) };
      });
      const axes = new Set(curve.map(p=>p.growth_axis));
      const requiredPoints = formulaCode === "mycology.piecewise_growth_phases" ? 9 : 3;
      if (curve.length < requiredPoints || axes.size !== 1 || !curve[0].growth_axis) {
        output.push({formula_code:formulaCode,status:"rejected",error:"mycology_curve_requires_three_points_and_one_explicit_growth_axis"}); continue;
      }
      if (curve.some(p=>!Number.isFinite(p.diameter_mm) || p.diameter_mm<0)) {
        output.push({formula_code:formulaCode,status:"rejected",error:"mycology_curve_contains_invalid_diameter"}); continue;
      }
      inputs = {series_points:curve.map(p=>({elapsed_hours:p.elapsed_hours,diameter_mm:p.diameter_mm}))};
    } else if (domain === "greentech") {
      if (formulaCode === "greentech.plant_height_curve_regression") {
        if (usable.length < 3) { output.push({formula_code:formulaCode,status:"rejected",error:"plant_height_regression_requires_at_least_three_measurements",usable_count:usable.length}); continue; }
        inputs = {series_points:usable.map(m=>({elapsed_hours:(Date.parse(String(m.measured_at))-Date.parse(String(first.measured_at)))/3600000,height_mm:Number(m.normalized_value ?? m.raw_value)}))};
      } else inputs = { initial_height_mm: initial, final_height_mm: final, elapsed_days: elapsedHours / 24 };
    } else {
      const points = usable.map((m: Record<string, unknown>, index: number) => {
        const metadata = m.metadata && typeof m.metadata === "object" && !Array.isArray(m.metadata)
          ? m.metadata as Record<string, unknown> : {};
        const blankCorrected = metadata.od600_blank_corrected === true || metadata.blank_correction_applied === true;
        if (!blankCorrected) return null;
        const value = Number(m.normalized_value ?? m.raw_value);
        return { elapsed_hours: (Date.parse(String(m.measured_at))-Date.parse(String(first.measured_at)))/3600000,
          blank_corrected_od600: value, source_measurement_id: String(m.id) };
      });
      if (points.some(point => point === null)) {
        output.push({ formula_code: formulaCode, status: "rejected", error: "od600_series_requires_explicit_blank_correction_metadata" }); continue;
      }
      const minimumLabPoints = formulaCode === "lab.od600_piecewise_growth_regimes" ? 9 : 3;
      if (points.length < minimumLabPoints) {
        output.push({ formula_code: formulaCode, status: "rejected", error: formulaCode === "lab.od600_piecewise_growth_regimes" ? "od600_piecewise_requires_at_least_nine_points" : "od600_regression_requires_at_least_three_points", usable_count: points.length }); continue;
      }
      if (points.some(point => !(Number(point!.blank_corrected_od600) > 0))) {
        output.push({ formula_code: formulaCode, status: "rejected", error: "od600_regression_requires_positive_blank_corrected_values" }); continue;
      }
      inputs = { series_points: points.map(point => ({ elapsed_hours: point!.elapsed_hours, blank_corrected_od600: point!.blank_corrected_od600 })) };
    }
    output.push({
      formula_code: formulaCode, formula_version: formulaVersion, inputs,
      subject_kind: domain === "mycology" ? "culture" : domain === "greentech" ? "plant_culture" : "sample",
      subject_id: subjectId, source_measurement_ids: [...new Set(usable.map((m: Record<string, unknown>) => String(m.id)))],
      series_metadata: { variable_code: variableCode, unit_code: firstUnit, first_measured_at: first.measured_at,
        last_measured_at: last.measured_at, usable_measurement_count: usable.length,
        method: firstMethod, instrument: firstInstrument, aggregation: domain === "lab" ? "ols_slope_ln_od600_vs_elapsed_hours" : domain === "mycology" ? "ols_diameter_vs_elapsed_hours" : "first_to_last_observation",
        experimental_unit_id: firstExperimentalUnit,
        intermediate_points_retained_in_count: usable.length }
    });
  }
  return output;
}


async function buildReplicateSummaries(admin: ReturnType<typeof createClient>, organizationId: string, domain: string, requests: unknown) {
  if (!Array.isArray(requests)) return [];
  if (requests.length > 25) throw new Error("replicate_request_limit_exceeded");
  const output: Record<string, unknown>[] = [];
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  for (const raw of requests) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      output.push({ status: "rejected", error: "replicate_request_must_be_object" }); continue;
    }
    const item = raw as Record<string, unknown>;
    const subjectId = typeof item.subject_id === "string" ? item.subject_id : "";
    const variableCode = typeof item.variable_code === "string" ? item.variable_code : "";
    const measuredAt = typeof item.measured_at === "string" ? item.measured_at : "";
    const subjectColumn = domain === "mycology" ? "culture_id" : domain === "greentech" ? "plant_culture_id" : domain === "lab" ? "sample_id" : null;
    if (!subjectColumn || !uuidPattern.test(subjectId) || !variableCode || !Number.isFinite(Date.parse(measuredAt))) {
      output.push({ status: "rejected", error: "replicate_request_missing_valid_subject_variable_or_timestamp" }); continue;
    }
    const { data: variable, error: variableError } = await admin.from("variables")
      .select("canonical_unit_code").eq("code", variableCode).maybeSingle();
    if (variableError || !variable?.canonical_unit_code) {
      output.push({ status: "rejected", variable_code: variableCode, error: "replicate_variable_canonical_unit_missing" }); continue;
    }
    let query = admin.from("measurements")
      .select("id,raw_value,raw_unit_code,normalized_value,normalized_unit_code,measured_at,method,instrument,quality_state,exclusion_reason,experimental_unit_id")
      .eq("organization_id", organizationId).eq("variable_code", variableCode)
      .eq(subjectColumn, subjectId).eq("measured_at", measuredAt)
      .in("quality_state", ["controlled","validated"]).is("exclusion_reason", null)
      .not("experimental_unit_id", "is", null)
      .order("created_at", { ascending: true }).limit(200);
    if (typeof item.method === "string") query = query.eq("method", item.method);
    if (typeof item.instrument === "string") query = query.eq("instrument", item.instrument);
    const { data, error } = await query;
    if (error) throw new Error("replicate_measurement_lookup_failed:" + error.message);
    const candidates = (data ?? []) as Record<string, unknown>[];
    const unitIds = [...new Set(candidates.map(m=>String(m.experimental_unit_id)).filter(id=>uuidPattern.test(id)))];
    if (!unitIds.length) {
      output.push({ status:"rejected",variable_code:variableCode,error:"replicates_require_registered_experimental_units" }); continue;
    }
    const { data: units, error: unitsError } = await admin.from("experimental_units")
      .select("id,experiment_id,replicate_no,treatment_code,unit_code,metadata")
      .eq("organization_id",organizationId).in("id",unitIds);
    if (unitsError) throw new Error("replicate_experimental_unit_lookup_failed:"+unitsError.message);
    const unitById = new Map(((units ?? []) as Record<string,unknown>[]).map(u=>[String(u.id),u]));
    const replicateLevel = (unit: Record<string,unknown>) => {
      const metadata = unit.metadata && typeof unit.metadata === "object" && !Array.isArray(unit.metadata)
        ? unit.metadata as Record<string,unknown> : {};
      const raw = String(metadata.replicate_level ?? metadata.experimental_unit_level ?? "").trim().toLowerCase();
      const allowed = ["biological","plot","technical","subsample","unspecified"];
      return allowed.includes(raw) ? raw : "unspecified";
    };
    const usable = candidates.filter(m=>{
      const unit=unitById.get(String(m.experimental_unit_id));
      const value=m.normalized_value ?? m.raw_value;
      const unitCode=m.normalized_unit_code ?? m.raw_unit_code;
      const level = unit ? replicateLevel(unit) : "unspecified";
      return Boolean(unit) && Number.isInteger(unit?.replicate_no) && Number(unit?.replicate_no)>0 &&
        (domain !== "greentech" || level !== "unspecified") &&
        (finiteMeasurementNumber(value)) && String(unitCode)===String(variable.canonical_unit_code);
    });
    if (usable.length < 2) {
      output.push({status:"rejected",variable_code:variableCode,error:"replicates_require_two_eligible_experimental_units",usable_measurement_count:usable.length}); continue;
    }
    const groups = new Map<string,{measurement:Record<string,unknown>;unit:Record<string,unknown>}[]>();
    for (const measurement of usable) {
      const unit=unitById.get(String(measurement.experimental_unit_id))!;
      const key=[String(unit.experiment_id),String(unit.treatment_code ?? ""),replicateLevel(unit),String(measurement.method ?? ""),String(measurement.instrument ?? "")].join("|");
      const group=groups.get(key) ?? [];
      group.push({measurement,unit});
      groups.set(key,group);
    }
    let savedCount=0;
    for (const [groupKey,group] of groups) {
      const replicateNos=group.map(x=>Number(x.unit.replicate_no));
      const uniqueReplicateNos=new Set(replicateNos);
      if(group.length<2 || uniqueReplicateNos.size!==group.length) continue;
      const values=group.map(x=>Number(x.measurement.normalized_value ?? x.measurement.raw_value));
      if(values.some(v=>!Number.isFinite(v))) continue;
      const sorted=[...values].sort((a,b)=>a-b);
      const n=sorted.length;
      const mean=sorted.reduce((a,b)=>a+b,0)/n;
      const median=n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2;
      const variance=sorted.reduce((sum,v)=>sum+(v-mean)**2,0)/(n-1);
      const sd=Math.sqrt(variance);
      const cv=mean===0?null:(sd/Math.abs(mean))*100;
      const deviations=values.map(v=>Math.abs(v-median)).sort((a,b)=>a-b);
      const mad=n%2?deviations[(n-1)/2]:(deviations[n/2-1]+deviations[n/2])/2;
      const measurementValues=group.map(x=>({id:String(x.measurement.id),value:Number(x.measurement.normalized_value ?? x.measurement.raw_value)}));
      const outlierIds=n>=4 && mad>0
        ? measurementValues.filter(x=>Math.abs(0.67448975*(x.value-median)/mad)>3.5).map(x=>x.id)
        : [];
      const ids=measurementValues.map(x=>x.id).sort();
      const replicateMap=group.map(x=>({
        measurement_id:x.measurement.id,experimental_unit_id:x.unit.id,
        replicate_no:x.unit.replicate_no,value:x.measurement.normalized_value ?? x.measurement.raw_value
      })).sort((a,b)=>Number(a.replicate_no)-Number(b.replicate_no));
      const keyMaterial=[domain,subjectId,variableCode,new Date(measuredAt).toISOString(),groupKey,...ids].join("|");
      const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(keyMaterial));
      const keyHash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
      const idempotencyKey="replicate_summary:"+keyHash;
      const subjectKind=domain==="mycology"?"culture":domain==="greentech"?"plant_culture":"sample";
      const summaryMetadata={
        experiment_id:group[0].unit.experiment_id,treatment_code:group[0].unit.treatment_code ?? null,
        replicate_level:replicateLevel(group[0].unit),
        experimental_unit_codes:group.map(x=>x.unit.unit_code ?? null),
        replicate_map:replicateMap,measurement_values:measurementValues,
        distinct_experimental_units:group.length,distinct_replicate_numbers:uniqueReplicateNos.size,
        aggregation:"unweighted_arithmetic_summary_within_experiment_and_treatment",
        outlier_method:"modified_z_score_mad_3.5",outliers_excluded:false,
        unit_code:variable.canonical_unit_code,quality_states:["controlled","validated"]
      };
      const {data:saved,error:saveError}=await admin.from("measurement_replicate_summaries").upsert({
        organization_id:organizationId,domain,subject_kind:subjectKind,subject_id:subjectId,
        variable_code:variableCode,unit_code:variable.canonical_unit_code,measured_at:measuredAt,
        method:group[0].measurement.method ?? null,instrument:group[0].measurement.instrument ?? null,
        replicate_count:n,mean_value:mean,sample_sd:sd,coefficient_of_variation_pct:cv,
        minimum_value:sorted[0],median_value:median,maximum_value:sorted[n-1],
        mad_value:mad,outlier_measurement_ids:outlierIds,idempotency_key:idempotencyKey,
        summary_metadata:summaryMetadata
      },{onConflict:"organization_id,idempotency_key"}).select("id").single();
      if(saveError||!saved?.id) throw new Error("replicate_summary_persist_failed:"+(saveError?.message ?? "missing_id"));
      const links=group.map(x=>({
        organization_id:organizationId,summary_id:saved.id,measurement_id:x.measurement.id,
        experimental_unit_id:x.measurement.experimental_unit_id,
        value_used:Number(x.measurement.normalized_value ?? x.measurement.raw_value)
      }));
      const {error:linkError}=await admin.from("measurement_replicate_summary_inputs")
        .upsert(links,{onConflict:"organization_id,summary_id,measurement_id",ignoreDuplicates:true});
      if(linkError) throw new Error("replicate_summary_input_link_failed:"+linkError.message);
      savedCount++;
      output.push({
        status:"summarized",persisted:true,summary_id:saved.id,domain,variable_code:variableCode,
        unit_code:variable.canonical_unit_code,measured_at:measuredAt,
        experiment_id:group[0].unit.experiment_id,treatment_code:group[0].unit.treatment_code ?? null,
        replicate_level:replicateLevel(group[0].unit),replicate_count:n,mean,sample_sd:sd,coefficient_of_variation_pct:cv,
        minimum:sorted[0],median,maximum:sorted[n-1],mad,
        outlier_measurement_ids:outlierIds,outliers_excluded:false,source_measurement_ids:ids
      });
    }
    if(!savedCount) output.push({status:"rejected",variable_code:variableCode,error:"no_experiment_treatment_group_contains_two_distinct_replicates"});
  }
  return output;
}

async function runRegisteredFormulaRequests(admin: ReturnType<typeof createClient>, organizationId: string, domain: string, requests: unknown, jobId: string) {
  if (!Array.isArray(requests)) return [];
  if (requests.length > 50) throw new Error("formula_request_limit_exceeded");
  const codes = [...new Set(requests.map((r) => r && typeof r === "object" ? String((r as Record<string, unknown>).formula_code ?? "") : "").filter(Boolean))];
  if (!codes.length) return [];
  const { data: formulas, error } = await admin.from("derived_formula_registry")
    .select("domain,formula_code,formula_version,implementation_key,output_metric_code,output_unit_code,input_contract,assumptions,limitations")
    .eq("status", "active").in("formula_code", codes)
    .or("organization_id.is.null,organization_id.eq." + organizationId);
  if (error) throw new Error("formula_registry_lookup_failed:" + error.message);
  const results: Record<string, unknown>[] = [];
  for (let requestIndex = 0; requestIndex < requests.length; requestIndex++) {
    const request = requests[requestIndex];
    if (!request || typeof request !== "object" || Array.isArray(request)) {
      results.push({ status: "rejected", error: "formula_request_must_be_object" }); continue;
    }
    const item = request as Record<string, unknown>;
    const formula = (formulas ?? []).find((f: Record<string, unknown>) =>
      f.formula_code === item.formula_code && f.formula_version === item.formula_version &&
      (f.domain === domain || f.domain === "cross_domain"));
    if (!formula) {
      results.push({ formula_code: item.formula_code ?? null, status: "rejected", error: "active_formula_version_not_found" }); continue;
    }
    const values = item.inputs && typeof item.inputs === "object" && !Array.isArray(item.inputs) ? item.inputs as FormulaInput : {};
    try {
      const calculated = executeFormula(String(formula.implementation_key), values);
      if (formula.output_unit_code && formula.output_unit_code !== calculated.unit)
        throw new Error("formula_output_unit_mismatch");
      const assumptions = [...(Array.isArray(formula.assumptions) ? formula.assumptions : []), ...calculated.assumptions];
      const limitations = [...(Array.isArray(formula.limitations) ? formula.limitations : []), ...calculated.limitations];
      const subjectKind = typeof item.subject_kind === "string" && item.subject_kind.trim() ? item.subject_kind : domain + "_subject";
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (item.subject_id !== undefined && item.subject_id !== null &&
          (typeof item.subject_id !== "string" || !uuidPattern.test(item.subject_id)))
        throw new Error("invalid_formula_subject_id");
      const subjectId = typeof item.subject_id === "string" ? item.subject_id : null;
      const idempotencyKey = "engine_job:" + jobId + ":" + requestIndex + ":" + String(formula.formula_code) + "@" + String(formula.formula_version);
      const rawMeasurementIds = item.source_measurement_ids === undefined ? [] : item.source_measurement_ids;
      const rawBatchObservationIds = item.source_batch_performance_observation_ids === undefined ? [] : item.source_batch_performance_observation_ids;
      if (!Array.isArray(rawMeasurementIds) || !Array.isArray(rawBatchObservationIds) ||
          rawMeasurementIds.length > 100 || rawBatchObservationIds.length > 100)
        throw new Error("invalid_formula_source_reference_list");
      const sourceMeasurementIds = [...new Set(rawMeasurementIds)];
      const sourceBatchObservationIds = [...new Set(rawBatchObservationIds)];
      if ([...sourceMeasurementIds, ...sourceBatchObservationIds].some((id) => typeof id !== "string" || !uuidPattern.test(id)))
        throw new Error("invalid_formula_source_reference_id");
      const { data: persisted, error: persistError } = await admin.from("derived_metric_results").upsert({
        organization_id: organizationId, domain, subject_kind: subjectKind, subject_id: subjectId,
        metric_code: formula.output_metric_code, numeric_value: calculated.value, unit_code: calculated.unit,
        formula_code: formula.formula_code, formula_version: formula.formula_version,
        input_snapshot: { inputs: values, assumptions, implementation_key: formula.implementation_key, series_metadata: item.series_metadata ?? null, calculation_diagnostics: (calculated as unknown as Record<string, unknown>).diagnostics ?? null, source_measurement_ids: sourceMeasurementIds, source_batch_performance_observation_ids: sourceBatchObservationIds },
        limitations, idempotency_key: idempotencyKey
      }, { onConflict: "organization_id,idempotency_key", ignoreDuplicates: true }).select("id").maybeSingle();
      if (persistError) throw new Error("derived_metric_persist_failed:" + persistError.message);
      let resultId = persisted?.id as string | undefined;
      if (!resultId) {
        const { data: existing, error: existingError } = await admin.from("derived_metric_results")
          .select("id").eq("organization_id", organizationId).eq("idempotency_key", idempotencyKey).maybeSingle();
        if (existingError || !existing?.id) throw new Error("derived_metric_idempotency_lookup_failed");
        resultId = existing.id as string;
      }
      const inputLinks: Record<string, unknown>[] = [
        ...sourceMeasurementIds.map((id: unknown) => ({ organization_id: organizationId, derived_metric_result_id: resultId, source_measurement_id: id, input_role: "measurement" })),
        ...sourceBatchObservationIds.map((id: unknown) => ({ organization_id: organizationId, derived_metric_result_id: resultId, source_batch_performance_observation_id: id, input_role: "batch_performance_observation" }))
      ];
      if (inputLinks.length) {
        const { error: linkError } = await admin.from("derived_metric_inputs").insert(inputLinks);
        if (linkError && !String(linkError.message).toLowerCase().includes("duplicate"))
          throw new Error("derived_metric_input_link_failed:" + linkError.message);
      }
      results.push({
        formula_code: formula.formula_code, formula_version: formula.formula_version,
        metric_code: formula.output_metric_code, value: calculated.value, unit: calculated.unit,
        status: "calculated", persisted: true, derived_metric_result_id: resultId,
        assumptions, limitations,
        provenance: { input_values: values, implementation_key: formula.implementation_key, series_metadata: item.series_metadata ?? null, source_measurement_ids: sourceMeasurementIds, source_batch_performance_observation_ids: sourceBatchObservationIds }
      });
    } catch (e) {
      results.push({ formula_code: formula.formula_code, formula_version: formula.formula_version,
        status: "rejected", error: e instanceof Error ? e.message : "formula_calculation_failed" });
    }
  }
  return results;
}


function buildContextFrames(observations: Record<string, unknown>[], windowMinutes = 30) {
  const windowMs = Math.max(1, Math.min(1440, windowMinutes)) * 60_000;
  const byUnit = new Map<string, Record<string, unknown>[]>();
  for (const observation of observations) {
    const at = Date.parse(String(observation.observed_at ?? ""));
    const variable = String(observation.variable ?? "").trim();
    if (!Number.isFinite(at) || !variable || typeof observation.value !== "number" || !Number.isFinite(observation.value)) continue;
    const unitId = typeof observation.experimental_unit_id === "string" ? observation.experimental_unit_id : "unspecified_unit";
    const stageValue = String(observation.lifecycle_stage ?? (observation.context && typeof observation.context === "object" ? (observation.context as Record<string, unknown>).lifecycle_stage ?? "" : "")).trim().toLowerCase();
    const stage = stageValue || "stage_unspecified";
    const groupKey = unitId + "::" + stage;
    const group = byUnit.get(groupKey) ?? [];
    group.push({ ...observation, lifecycle_stage: stage === "stage_unspecified" ? null : stage, _at: at });

    byUnit.set(unitId, group);
  }
  const frames: Record<string, unknown>[] = [];
  for (const [groupKey, group] of byUnit) {
    const [unitId, stage] = groupKey.split("::");
    group.sort((a,b) => Number(a._at)-Number(b._at));
    let current: Record<string, unknown>[] = [];
    let anchor = -1;
    const flush = () => {
      if (!current.length) return;
      const variables = [...new Set(current.map(o=>String(o.variable)))];
      if (variables.length >= 2) {
        const times = current.map(o=>Number(o._at));
        frames.push({
          experimental_unit_id: unitId === "unspecified_unit" ? null : unitId,
          lifecycle_stage: stage === "stage_unspecified" ? null : stage,
          stage_assignment: stage === "stage_unspecified" ? "not_recorded" : "explicit_observation_metadata",
          window_minutes: windowMinutes,
          interval_start: new Date(Math.min(...times)).toISOString(),
          interval_end: new Date(Math.max(...times)).toISOString(),
          span_minutes: Number(((Math.max(...times)-Math.min(...times))/60_000).toFixed(2)),
          observation_count: current.length,
          distinct_variable_count: variables.length,
          variables,
          categories: [...new Set(current.map(o=>String(o.category ?? o.variable)))],
          observations: current.map(o=>({
            variable:o.variable, value:o.value, unit:o.unit ?? null,
            observed_at:o.observed_at, quality_state:o.quality_state ?? null,
            source:o.source ?? null,
            measurement_id:o.measurement_id ?? null,
            environmental_observation_id:o.environmental_observation_id ?? null
          }))
        });
      }
      current = [];
      anchor = -1;
    };
    for (const observation of group) {
      const at = Number(observation._at);
      if (anchor < 0 || at-anchor <= windowMs) {
        if (anchor < 0) anchor = at;
        current.push(observation);
      } else {
        flush();
        anchor = at;
        current.push(observation);
      }
    }
    flush();
  }
  return frames.sort((a,b)=>Date.parse(String(a.interval_start))-Date.parse(String(b.interval_start)));
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");
  if (!supabaseUrl || !serviceKey) return json(500, { error: "worker_configuration_missing" });

  // Gateway JWT verification is disabled only for this internal worker.
  // Accept either the project service key or the dedicated Vault-backed cron secret.
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\\s+/i, "") ?? "";
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let authorized = constantTimeEqual(bearer, serviceKey);
  if (!authorized) {
    const cronSecret = req.headers.get("x-ba-engine-cron-secret") ?? bearer;
    const { data, error } = await admin.rpc("verify_engine_worker_cron_secret", { p_secret: cronSecret });
    authorized = !error && data === true;
  }
  if (!authorized) return json(403, { error: "worker_secret_required" });

  const body = await req.json().catch(() => ({}));
  const requested = Number(body?.max_jobs ?? 1);
  const maxJobs = Number.isInteger(requested) ? Math.max(1, Math.min(5, requested)) : 1;
  const leaseSeconds = 180;
  const workerId = `edge-worker:${crypto.randomUUID()}`;
  const results: Record<string, unknown>[] = [];

  async function getEngine(code: string): Promise<Engine> {
    const { data, error } = await admin.from("engine_registry").select("engine_code,contract_version,execution_mode,entrypoint,status,timeout_seconds").eq("engine_code", code).maybeSingle();
    if (error) throw new Error(`registry_lookup_failed:${error.message}`);
    if (!data || data.status !== "active") throw new Error("engine_not_active");
    return data as Engine;
  }

  for (let i = 0; i < maxJobs; i++) {
    const { data: claimed, error: claimError } = await admin.rpc("claim_engine_job", { p_worker_id: workerId, p_lease_seconds: leaseSeconds });
    if (claimError) return json(500, { ok: false, error: "claim_failed", detail: claimError.message, processed: results.length, results });
    const job = (claimed as Job[] | null)?.[0];
    if (!job) break;

    let output: Record<string, unknown> | null = null;
    let failure: Record<string, unknown> | null = null;
    let heartbeatFailure: string | null = null;

    try {
      let target = await getEngine(job.engine_code);
      let input: Record<string, unknown> = job.payload ?? {};
      if (target.contract_version !== job.contract_version) throw new Error("contract_version_mismatch");

      if (job.engine_code === "core.orchestrator") {
        const targetCode = input.target_engine_code;
        if (typeof targetCode !== "string" || !targetCode) throw new Error("target_engine_code_required");
        target = await getEngine(targetCode);
        const delegated = input.payload;
        input = delegated && typeof delegated === "object" && !Array.isArray(delegated) ? delegated as Record<string, unknown> : {};
      }

      if (target.execution_mode === "worker") {
        if (target.engine_code !== "mycology.interpreter") {
          const domain = target.engine_code === "greentech.interpreter" ? "greentech"
            : target.engine_code === "lab.interpreter" ? "lab" : null;
          if (!domain) throw new Error(`worker_handler_not_installed:${target.entrypoint ?? target.engine_code}`);
          const { data: domainProfile, error: domainProfileError } = await admin.from("domain_interpretation_profiles")
            .select("id,profile_code,profile_version,rules")
            .eq("organization_id", job.organization_id).eq("domain", domain).eq("status", "active")
            .order("valid_from", { ascending: false }).limit(1).maybeSingle();
          if (domainProfileError) throw new Error(`${domain}_profile_lookup_failed:${domainProfileError.message}`);
          if (!domainProfile) throw new Error(`active_${domain}_interpretation_profile_missing`);
          const suppliedObservations = Array.isArray(input.observations) ? input.observations as Record<string, unknown>[] : [];
          const subjectMeasurementsQuery = domain === "greentech" && typeof input.plant_culture_id === "string"
            ? admin.from("measurements").select("id,variable_code,raw_value,raw_unit_code,normalized_value,normalized_unit_code,measured_at,method,instrument,quality_state,exclusion_reason,experimental_unit_id,metadata")
                .eq("organization_id", job.organization_id).eq("plant_culture_id", input.plant_culture_id)
                .order("measured_at", { ascending: true }).limit(500)
            : domain === "lab" && typeof input.sample_id === "string"
              ? admin.from("measurements").select("id,variable_code,raw_value,raw_unit_code,normalized_value,normalized_unit_code,measured_at,method,instrument,quality_state,exclusion_reason,experimental_unit_id,metadata")
                  .eq("organization_id", job.organization_id).eq("sample_id", input.sample_id)
                  .order("measured_at", { ascending: true }).limit(500)
              : null;
          let persistedMeasurements: Record<string, unknown>[] = [];
          if (subjectMeasurementsQuery) {
            const { data, error } = await subjectMeasurementsQuery;
            if (error) throw new Error(`${domain}_subject_measurements_lookup_failed:${error.message}`);
            persistedMeasurements = (data ?? []).map((m: Record<string, unknown>) => {
              const metadata = m.metadata && typeof m.metadata === "object" ? m.metadata as Record<string, unknown> : {};
              return {
                measurement_id: m.id, variable: m.variable_code, experimental_unit_id: m.experimental_unit_id ?? null,
                value: m.normalized_value ?? m.raw_value,
                unit: m.normalized_unit_code ?? m.raw_unit_code,
                observed_at: m.measured_at, quality_state: normalizeMeasurementQuality(m.quality_state),
                method: m.method, instrument: m.instrument,
                exclusion_reason: m.exclusion_reason, source: "measurements",
                context: { ...metadata, measurement_method: m.method, instrument: m.instrument,
                  sensor_or_provider: m.instrument ?? metadata.sensor_or_provider ?? null },
              };
            });
          }
          let environmentalObservations: Record<string, unknown>[] = [];
          if (domain === "greentech" && typeof input.location_id === "string") {
            let environmentalQuery = admin.from("environmental_observations")
              .select("id,data_family,provider_code,dataset_code,variable_code,value,unit_code,observed_at,spatial_resolution_m,quality_flag,source_url,metadata")
              .eq("organization_id", job.organization_id).eq("location_id", input.location_id)
              .order("observed_at", { ascending: true }).limit(500);
            if (typeof input.observed_since === "string" && Number.isFinite(Date.parse(input.observed_since)))
              environmentalQuery = environmentalQuery.gte("observed_at", input.observed_since);
            if (typeof input.observed_until === "string" && Number.isFinite(Date.parse(input.observed_until)))
              environmentalQuery = environmentalQuery.lte("observed_at", input.observed_until);
            const { data, error } = await environmentalQuery;
            if (error) throw new Error(`greentech_environmental_observations_lookup_failed:${error.message}`);
            environmentalObservations = (data ?? []).map((e: Record<string, unknown>) => {
              const metadata = e.metadata && typeof e.metadata === "object" ? e.metadata as Record<string, unknown> : {};
              return {
                environmental_observation_id: e.id, variable: e.variable_code, value: e.value, unit: e.unit_code,
                observed_at: e.observed_at, quality_state: e.quality_flag === "excluded" ? "excluded" : "observed",
                source: "environmental_observations",
                context: { ...metadata, data_family: e.data_family, provider_code: e.provider_code,
                  sensor_or_provider: e.provider_code, dataset_code: e.dataset_code,
                  spatial_resolution_m: e.spatial_resolution_m, quality_flag: e.quality_flag,
                  source_url: e.source_url, location_id: input.location_id },
              };
            });
          }
          const raw = [...persistedMeasurements, ...environmentalObservations, ...suppliedObservations];
          const variableCodes = [...new Set(raw.map(o => String(o.variable ?? o.parameter ?? o.metric ?? "").trim()).filter(Boolean))];
          const { data: catalogRows, error: catalogError } = variableCodes.length
            ? await admin.from("domain_variable_catalog").select("variable_code,category,context_requirements,comparison_policy,metadata")
                .eq("domain", domain).eq("status", "active").in("variable_code", variableCodes)
            : { data: [], error: null };
          if (catalogError) throw new Error(`${domain}_variable_catalog_lookup_failed:${catalogError.message}`);
          const { data: variableRows, error: variableError } = variableCodes.length
            ? await admin.from("variables").select("code,label,dimension,canonical_unit_code,description").in("code", variableCodes)
            : { data: [], error: null };
          if (variableError) throw new Error(`${domain}_variable_dictionary_lookup_failed:${variableError.message}`);
          const catalog = new Map((catalogRows ?? []).map((row: Record<string, unknown>) => [String(row.variable_code), row]));
          const definitions = new Map((variableRows ?? []).map((row: Record<string, unknown>) => [String(row.code), row]));
          const seen = new Set<string>();
          const findings: Record<string, unknown>[] = [];
          const baseContext = input.context && typeof input.context === "object" ? input.context as Record<string, unknown> : {};
          const observations = raw.map((o, index) => {
            const variable = String(o.variable ?? o.parameter ?? o.metric ?? "").trim();
            const unit = typeof o.unit === "string" ? o.unit.trim() : "";
            const timestamp = typeof o.observed_at === "string" ? Date.parse(o.observed_at) : NaN;
            const hasValue = typeof o.value === "number" && Number.isFinite(o.value);
            const identity = variable.toLowerCase() + "|" + String(o.observed_at ?? "") + "|" + unit;
            const duplicate = Boolean(variable) && seen.has(identity);
            if (variable) seen.add(identity);
            const issues: string[] = [];
            const entry = catalog.get(variable);
            const definition = definitions.get(variable);
            const observationContext = o.context && typeof o.context === "object" ? o.context as Record<string, unknown> : {};
            const context = { ...baseContext, ...observationContext };
            if (!variable) issues.push("variable_missing");
            if (variable && !entry) issues.push("unknown_domain_variable");
            if (o.observed_at && !Number.isFinite(timestamp)) issues.push("timestamp_invalid");
            if (hasValue && !unit) issues.push("numeric_unit_missing");
            if (entry && hasValue && unit && definition?.canonical_unit_code && unit !== definition.canonical_unit_code) issues.push("unit_not_canonical");
            if (duplicate) issues.push("possible_duplicate");
            const requiredContext = Array.isArray(entry?.context_requirements) ? entry.context_requirements as string[] : [];
            const missingContext = requiredContext.filter(key => context[key] === undefined || context[key] === null || context[key] === "");
            if (missingContext.length) issues.push("required_context_missing");
            const quality = normalizeMeasurementQuality(o.quality_state ?? "observed");
            if (!["observed","validated","estimated","excluded"].includes(quality)) issues.push("unknown_quality_state");
            return { index, source: o.source ?? "job_payload",
              experimental_unit_id: o.experimental_unit_id ?? context.experimental_unit_id ?? null,
              measurement_id: o.measurement_id ?? null,
              environmental_observation_id: o.environmental_observation_id ?? null,
              variable: variable || null, variable_definition: definition ?? null,
              category: entry?.category ?? null, comparison_policy: entry?.comparison_policy ?? "descriptive_only",
              required_context: requiredContext, missing_context: missingContext,
              value: o.value ?? null, unit: unit || null, canonical_unit: definition?.canonical_unit_code ?? null,
              method: o.method ?? null, instrument: o.instrument ?? null,
              exclusion_reason: o.exclusion_reason ?? null,
              context, observed_at: o.observed_at ?? null, quality_state: quality, issues,
              comparison_eligible: issues.length === 0 && hasValue && (quality === "observed" || quality === "validated")
                && entry?.comparison_policy !== "descriptive_only" };
          });
          for (const observation of observations) {
            for (const issue of observation.issues) findings.push({
              code: domain + "_observation_" + issue, severity: "information",
              observation_index: observation.index, variable: observation.variable,
            });
          }
          const subject = domain === "greentech"
            ? input.plant_id ?? input.plot_id ?? input.crop_id ?? input.subject_id ?? null
            : input.sample_id ?? input.sample_code ?? input.subject_id ?? null;
          if (!subject) findings.push({
            code: domain + "_subject_context_missing", severity: "information",
            message: domain === "greentech"
              ? "Plant, plot or crop identity is absent; agronomic interpretation is limited."
              : "Sample identity is absent; microbiological interpretation is limited.",
          });
          const derivedMetrics = deriveDescriptiveSeries(observations as Record<string, unknown>[]);
          const contextFrames = buildContextFrames(observations as Record<string, unknown>[], 30);
          const environmentalContextLinks = domain === "greentech"
            ? (observations as Record<string, unknown>[])
                .filter(o => o.source !== "environmental_observations" && typeof o.observed_at === "string")
                .flatMap(biological => {
                  const biologicalAt = Date.parse(String(biological.observed_at));
                  const biologicalLocation = (biological.context && typeof biological.context === "object")
                    ? (biological.context as Record<string, unknown>).location_id : null;
                  if (!Number.isFinite(biologicalAt) || !biologicalLocation) return [];
                  return (observations as Record<string, unknown>[])
                    .filter(environmental => environmental.source === "environmental_observations"
                      && environmental.quality_state !== "excluded"
                      && typeof environmental.observed_at === "string"
                      && (environmental.context && typeof environmental.context === "object")
                      && (environmental.context as Record<string, unknown>).location_id === biologicalLocation)
                    .map(environmental => ({ environmental, delta: Math.abs(Date.parse(String(environmental.observed_at)) - biologicalAt) }))
                    .filter(match => Number.isFinite(match.delta) && match.delta <= 6 * 60 * 60 * 1000)
                    .sort((a,b) => a.delta-b.delta)
                    .slice(0,3)
                    .map(match => ({
                      biological_measurement_id: biological.measurement_id ?? null,
                      biological_variable: biological.variable,
                      biological_observed_at: biological.observed_at,
                      environmental_observation_id: match.environmental.environmental_observation_id ?? null,
                      environmental_variable: match.environmental.variable,
                      environmental_value: match.environmental.value,
                      environmental_unit: match.environmental.unit,
                      environmental_observed_at: match.environmental.observed_at,
                      absolute_time_delta_minutes: Number((match.delta/60000).toFixed(2)),
                      location_id: biologicalLocation,
                      association_type: "same_location_temporal_proximity",
                      causal_interpretation: false
                    }));
                })
            : [];
          output = {
            contract: "ba.domain-interpretation.v1", engine_code: target.engine_code, domain,
            profile: { id: domainProfile.id, code: domainProfile.profile_code, version: domainProfile.profile_version },
            subject, context: input.context && typeof input.context === "object" ? input.context : {},
            observations, observation_count: observations.length,
            context_frames: contextFrames, context_frame_count: contextFrames.length,
            environmental_context_links: environmentalContextLinks,
            environmental_context_link_count: environmentalContextLinks.length,
            environmental_context_link_policy: "GreenTech links only observations at the same explicit location within six hours; nearest three contextual records per biological observation are attached as temporal context, not causal evidence.",
            context_frame_policy: "Co-observations are grouped only within the same subject and experimental unit, using non-overlapping 30-minute windows anchored to the first observation; association is descriptive and does not establish causality.",
            derived_metrics: derivedMetrics, derived_metric_count: derivedMetrics.length,
            comparison_eligible_count: observations.filter(o => o.comparison_eligible).length,
            findings, interpretation_status: observations.length ? "descriptive_with_series" : "awaiting_observations",
            limitations: [
              "Generic domain quality control only; no biological diagnosis or intervention prescription.",
              "Disease, deficiency, organism identity and suitability require domain-specific validated evidence.",
              "Associations are descriptive and do not establish causality."
            ],
          };
        } else {
        if (target.engine_code !== "mycology.interpreter") throw new Error(`worker_handler_not_installed:${target.entrypoint ?? target.engine_code}`);
        const { data: culture, error: cultureError } = await admin.from("cultures")
          .select("id,biological_strain_profile_id")
          .eq("organization_id", job.organization_id).eq("id", input.culture_id).maybeSingle();
        if (cultureError) throw new Error(`mycology_culture_lookup_failed:${cultureError.message}`);
        if (!culture) throw new Error("mycology_culture_not_found_in_job_organization");

        const { data: profile, error: profileError } = await admin.from("domain_interpretation_profiles")
          .select("id,profile_code,profile_version,rules")
          .eq("organization_id", job.organization_id).eq("domain", "mycology").eq("status", "active")
          .order("valid_from", { ascending: false }).limit(1).maybeSingle();
        if (profileError) throw new Error(`mycology_profile_lookup_failed:${profileError.message}`);
        if (!profile) throw new Error("active_mycology_interpretation_profile_missing");

        const { data: mycologyMeasurements, error: mycologyMeasurementsError } = await admin.from("measurements")
          .select("id,variable_code,raw_value,raw_unit_code,normalized_value,normalized_unit_code,measured_at,method,instrument,quality_state,exclusion_reason,experimental_unit_id,metadata")
          .eq("organization_id", job.organization_id).eq("culture_id", input.culture_id)
          .order("measured_at", { ascending: true }).limit(500);
        if (mycologyMeasurementsError) throw new Error(`mycology_measurements_lookup_failed:${mycologyMeasurementsError.message}`);
        const persistedMycologyObservations = (mycologyMeasurements ?? []).map((m: Record<string, unknown>) => {
          const metadata = m.metadata && typeof m.metadata === "object" ? m.metadata as Record<string, unknown> : {};
          return {
            measurement_id: m.id, variable: m.variable_code, experimental_unit_id: m.experimental_unit_id ?? null,
            value: m.normalized_value ?? m.raw_value, unit: m.normalized_unit_code ?? m.raw_unit_code,
            observed_at: m.measured_at, quality_state: normalizeMeasurementQuality(m.quality_state),
            method: m.method, instrument: m.instrument, exclusion_reason: m.exclusion_reason,
            source: "measurements",
            lifecycle_stage: typeof metadata.lifecycle_stage === "string" ? metadata.lifecycle_stage : null,
            context: { ...metadata, measurement_method: m.method, instrument: m.instrument },
          };
        });
        const { data: mycologyEvents, error: mycologyEventsError } = await admin.from("events")
          .select("id,event_type,occurred_at,experimental_unit_id,location_id,environment_id,batch_id,payload")
          .eq("organization_id", job.organization_id).eq("culture_id", input.culture_id)
          .order("occurred_at", { ascending: true }).limit(500);
        if (mycologyEventsError) throw new Error(`mycology_events_lookup_failed:${mycologyEventsError.message}`);
        const lifecycleEvents = ((mycologyEvents ?? []) as Record<string, unknown>[]).map(event => {
          const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
            ? event.payload as Record<string, unknown> : {};
          const stageRaw = typeof payload.lifecycle_stage === "string" ? payload.lifecycle_stage
            : typeof payload.stage === "string" ? payload.stage : null;
          const eventType = String(event.event_type ?? "");
          const stage = stageRaw?.trim().toLowerCase() || null;
          const isHarvest = /harvest|récolte|recolte/i.test(eventType)
            || String(payload.event_category ?? "").toLowerCase() === "harvest";
          return {
            event_id: event.id,
            event_type: eventType,
            occurred_at: event.occurred_at,
            lifecycle_stage: stage,
            stage_source: stage ? (typeof payload.lifecycle_stage === "string" ? "payload.lifecycle_stage" : "payload.stage") : null,
            experimental_unit_id: event.experimental_unit_id ?? null,
            location_id: event.location_id ?? null,
            environment_id: event.environment_id ?? null,
            batch_id: event.batch_id ?? null,
            is_harvest_event: isHarvest,
            payload
          };
        });
        const explicitStageEvents = lifecycleEvents.filter(event => event.lifecycle_stage && Number.isFinite(Date.parse(String(event.occurred_at))));
        const stageEventGroups = new Map<string, typeof explicitStageEvents>();
        for (const event of explicitStageEvents) {
          const groupKey = `${String(event.batch_id ?? "batch_unspecified")}::${String(event.experimental_unit_id ?? "unit_unspecified")}`;
          const group = stageEventGroups.get(groupKey) ?? [];
          group.push(event);
          stageEventGroups.set(groupKey, group);
        }
        const stageTransitions: Record<string, unknown>[] = [];
        for (const [groupKey, group] of stageEventGroups.entries()) {
          group.sort((a,b) => Date.parse(String(a.occurred_at)) - Date.parse(String(b.occurred_at)));
          for (let index = 0; index < group.length; index++) {
            const current = group[index];
            const next = group[index + 1];
            const currentAt = Date.parse(String(current.occurred_at));
            const nextAt = next ? Date.parse(String(next.occurred_at)) : NaN;
            stageTransitions.push({
              grouping_key: groupKey,
              event_id: current.event_id,
              stage: current.lifecycle_stage,
              entered_at: current.occurred_at,
              next_stage: next?.lifecycle_stage ?? null,
              next_stage_at: next?.occurred_at ?? null,
              duration_to_next_stage_hours: next && nextAt >= currentAt
                ? Number(((nextAt-currentAt)/3_600_000).toFixed(2)) : null,
              transition_status: !next ? "awaiting_next_explicit_stage_event"
                : nextAt < currentAt ? "invalid_event_order" : "duration_between_explicit_stage_events",
              experimental_unit_id: current.experimental_unit_id,
              batch_id: current.batch_id
            });
          }
        }
        const harvestEvents = lifecycleEvents.filter(event => event.is_harvest_event);
        const harvestMassRecords: Record<string, unknown>[] = harvestEvents.map(event => {
          const payload = event.payload as Record<string, unknown>;
          const mass = typeof payload.fresh_mass_g === "number" ? payload.fresh_mass_g
            : typeof payload.harvest_mass_g === "number" ? payload.harvest_mass_g : null;
          return {
            event_id: event.event_id,
            occurred_at: event.occurred_at,
            fresh_mass_g: mass,
            mass_field: typeof payload.fresh_mass_g === "number" ? "fresh_mass_g"
              : typeof payload.harvest_mass_g === "number" ? "harvest_mass_g" : null,
            batch_id: event.batch_id,
            experimental_unit_id: event.experimental_unit_id
          };
        });
        const harvestEventIds = harvestEvents.map(event => String(event.event_id));
        let linkedHarvestObservationCount = 0;
        if (harvestEventIds.length) {
          const { data: linkedHarvestObservations, error: linkedHarvestObservationsError } = await admin.from("batch_performance_observations")
            .select("id,event_id,batch_id,metric_code,numeric_value,unit_code,observed_at,experimental_unit_id,quality_state,metadata")
            .eq("organization_id", job.organization_id).in("event_id", harvestEventIds).limit(1000);
          if (linkedHarvestObservationsError) throw new Error(`mycology_harvest_observations_lookup_failed:${linkedHarvestObservationsError.message}`);
          for (const observation of (linkedHarvestObservations ?? []) as Record<string, unknown>[]) {
            linkedHarvestObservationCount++;
            const metricCode = String(observation.metric_code ?? "");
            const unitCode = String(observation.unit_code ?? "").trim().toLowerCase();
            const qualityState = String(observation.quality_state ?? "").toLowerCase();
            const numericValue = typeof observation.numeric_value === "number" ? observation.numeric_value : Number(observation.numeric_value);
            const isFreshMassMetric = /harvest.*(mass|weight)|fresh.*(mass|yield|weight)|yield.*(fresh|mass)/i.test(metricCode);
            const gramsPerUnit = unitCode === "g" || unitCode === "gram" || unitCode === "grams" ? 1
              : unitCode === "kg" || unitCode === "kilogram" || unitCode === "kilograms" ? 1000 : null;
            const isExcludedQuality = /reject|exclude|invalid|discard/i.test(qualityState);
            if (!isFreshMassMetric || gramsPerUnit === null || !Number.isFinite(numericValue) || numericValue < 0 || isExcludedQuality) continue;
            // Event payload mass is authoritative for that event; do not count a linked
            // performance observation again when the same event already carries a mass.
            if (harvestMassRecords.some(record => record.event_id === observation.event_id
              && record.mass_field !== "performance_observation")) continue;
            if (harvestMassRecords.some(record => record.event_id === observation.event_id
              && record.mass_field === "performance_observation" && (record as Record<string, unknown>).measurement_id === observation.id)) continue;
            harvestMassRecords.push({
              event_id: observation.event_id,
              occurred_at: observation.observed_at,
              fresh_mass_g: Number((numericValue * gramsPerUnit).toFixed(3)),
              mass_field: "performance_observation",
              measurement_id: observation.id,
              source_metric_code: metricCode,
              source_unit_code: unitCode,
              batch_id: observation.batch_id,
              experimental_unit_id: observation.experimental_unit_id
            });
          }
        }
        // Multiple eligible fresh-mass observations attached to one harvest event are
        // ambiguous unless the event payload itself supplied the authoritative mass.
        // Do not sum potential duplicate measurements into an inflated harvest total.
        const performanceMassesByEvent = new Map<string, Record<string, unknown>[]>();
        for (const record of harvestMassRecords) {
          if (record.mass_field !== "performance_observation") continue;
          const eventId = String(record.event_id);
          const rows = performanceMassesByEvent.get(eventId) ?? [];
          rows.push(record);
          performanceMassesByEvent.set(eventId, rows);
        }
        const ambiguousHarvestMassEventIds: string[] = [];
        for (const [eventId, rows] of performanceMassesByEvent.entries()) {
          if (rows.length <= 1) continue;
          ambiguousHarvestMassEventIds.push(eventId);
          for (const row of rows) {
            row.fresh_mass_g = null;
            row.mass_field = "ambiguous_multiple_performance_observations";
            row.mass_quality = "ambiguous_not_counted";
            row.ambiguous_measurement_ids = rows.map(item => item.measurement_id);
          }
        }
        const knownHarvestMasses = harvestMassRecords.filter(record => typeof record.fresh_mass_g === "number" && Number.isFinite(record.fresh_mass_g as number) && (record.fresh_mass_g as number) >= 0);
        const flushGroups = new Map<string, { flush_key: string; event_ids: string[]; masses_g: number[]; event_count: number }>();
        const unassignedHarvestEvents: string[] = [];
        for (const record of harvestMassRecords) {
          const event = lifecycleEvents.find(candidate => candidate.event_id === record.event_id);
          const payload = event?.payload as Record<string, unknown> | undefined;
          const flushRaw = payload?.flush_id ?? payload?.flush_no ?? payload?.flush_number ?? payload?.fruiting_cycle_id;
          const flushKey = typeof flushRaw === "string" || typeof flushRaw === "number" ? String(flushRaw).trim() : "";
          if (!flushKey) {
            unassignedHarvestEvents.push(String(record.event_id));
            continue;
          }
          const key = `${String(record.batch_id ?? "batch_unspecified")}::${String(record.experimental_unit_id ?? "unit_unspecified")}::${flushKey}`;
          const group = flushGroups.get(key) ?? { flush_key: flushKey, event_ids: [], masses_g: [], event_count: 0 };
          group.event_ids.push(String(record.event_id));
          group.event_count++;
          if (typeof record.fresh_mass_g === "number" && Number.isFinite(record.fresh_mass_g) && record.fresh_mass_g >= 0) group.masses_g.push(record.fresh_mass_g);
          flushGroups.set(key, group);
        }
        const harvestUnitIds = Array.from(new Set(harvestMassRecords
          .map(record => typeof record.experimental_unit_id === "string" ? record.experimental_unit_id : null)
          .filter((id): id is string => Boolean(id))));
        const experimentalUnitById = new Map<string, Record<string, unknown>>();
        if (harvestUnitIds.length) {
          const { data: harvestUnits, error: harvestUnitsError } = await admin.from("experimental_units")
            .select("id,experiment_id,replicate_no,treatment_code,unit_code,metadata")
            .eq("organization_id", job.organization_id).in("id", harvestUnitIds);
          if (harvestUnitsError) throw new Error(`mycology_harvest_unit_lookup_failed:${harvestUnitsError.message}`);
          for (const unit of (harvestUnits ?? []) as Record<string, unknown>[]) experimentalUnitById.set(String(unit.id), unit);
        }
        const replicateFlushGroups = new Map<string, {
          batch_id: string; flush_key: string; treatment_code: string; experiment_id: string;
          replicate_masses: Map<number, { unit_id: string; mass_g: number }[]>;
          excluded_units: number;
        }>();
        for (const record of harvestMassRecords) {
          const event = lifecycleEvents.find(candidate => candidate.event_id === record.event_id);
          const payload = event?.payload as Record<string, unknown> | undefined;
          const flushRaw = payload?.flush_id ?? payload?.flush_no ?? payload?.flush_number ?? payload?.fruiting_cycle_id;
          const flushKey = typeof flushRaw === "string" || typeof flushRaw === "number" ? String(flushRaw).trim() : "";
          if (!flushKey || typeof record.fresh_mass_g !== "number" || !Number.isFinite(record.fresh_mass_g) || record.fresh_mass_g < 0) continue;
          const unitId = typeof record.experimental_unit_id === "string" ? record.experimental_unit_id : "";
          const unit = experimentalUnitById.get(unitId);
          if (!unit) continue;
          const metadata = unit.metadata && typeof unit.metadata === "object" && !Array.isArray(unit.metadata)
            ? unit.metadata as Record<string, unknown> : {};
          const replicateLevel = String(metadata.replicate_level ?? metadata.experimental_unit_level ?? "").trim().toLowerCase();
          const replicateNo = typeof unit.replicate_no === "number" ? unit.replicate_no : Number(unit.replicate_no);
          const treatmentCode = typeof unit.treatment_code === "string" ? unit.treatment_code.trim() : "";
          const experimentId = typeof unit.experiment_id === "string" ? unit.experiment_id : "";
          if (replicateLevel !== "biological" || !Number.isInteger(replicateNo) || replicateNo < 1 || !treatmentCode || !experimentId) continue;
          const batchId = String(record.batch_id ?? "batch_unspecified");
          const key = `${batchId}::${experimentId}::${treatmentCode}::${flushKey}`;
          const group = replicateFlushGroups.get(key) ?? {
            batch_id: batchId, flush_key: flushKey, treatment_code: treatmentCode, experiment_id: experimentId,
            replicate_masses: new Map<number, { unit_id: string; mass_g: number }[]>(), excluded_units: 0
          };
          const replicateRows = group.replicate_masses.get(replicateNo) ?? [];
          const existing = replicateRows.find(row => row.unit_id === unitId);
          if (existing) existing.mass_g += record.fresh_mass_g;
          else replicateRows.push({ unit_id: unitId, mass_g: record.fresh_mass_g });
          group.replicate_masses.set(replicateNo, replicateRows);
          replicateFlushGroups.set(key, group);
        }
        const flushReplicateComparisons = Array.from(replicateFlushGroups.entries()).map(([key, group]) => {
          const duplicateReplicateNos = Array.from(group.replicate_masses.entries())
            .filter(([, rows]) => rows.length > 1).map(([replicateNo]) => replicateNo);
          const replicateValues = Array.from(group.replicate_masses.entries())
            .filter(([, rows]) => rows.length === 1).map(([, rows]) => rows[0].mass_g);
          const n = replicateValues.length;
          const mean = n ? replicateValues.reduce((sum, value) => sum + value, 0) / n : null;
          const sampleSd = n >= 2 && mean !== null
            ? Math.sqrt(replicateValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1)) : null;
          return {
            grouping_key: key, batch_id: group.batch_id, experiment_id: group.experiment_id,
            treatment_code: group.treatment_code, flush_key: group.flush_key,
            biological_replicate_count: n,
            duplicate_replicate_numbers: duplicateReplicateNos,
            mean_fresh_mass_g_per_replicate: n >= 2 ? Number(mean!.toFixed(3)) : null,
            sample_sd_fresh_mass_g: sampleSd !== null ? Number(sampleSd.toFixed(3)) : null,
            min_fresh_mass_g: n >= 2 ? Number(Math.min(...replicateValues).toFixed(3)) : null,
            max_fresh_mass_g: n >= 2 ? Number(Math.max(...replicateValues).toFixed(3)) : null,
            status: duplicateReplicateNos.length ? "blocked_duplicate_replicate_numbers"
              : n >= 2 ? "descriptive_biological_replicate_summary" : "insufficient_biological_replicates",
            causal_claim: false,
            interpretation: "Descriptive comparison only; no inferential significance or treatment causality is claimed."
          };
        });
        const harvestByFlush = Array.from(flushGroups.entries()).map(([key, group]) => ({
          grouping_key: key,
          flush_key: group.flush_key,
          event_count: group.event_count,
          measured_mass_count: group.masses_g.length,
          fresh_mass_g: group.masses_g.length ? Number(group.masses_g.reduce((sum, value) => sum + value, 0).toFixed(3)) : null,
          event_ids: group.event_ids
        }));
        const productionTimelineGroups = new Map<string, {
          batch_id: string; experimental_unit_id: string | null;
          induction_events: { event_id: string; at: number }[];
          harvest_rows: { event_id: string; at: number; mass_g: number | null; flush_key: string | null }[];
        }>();
        const normalizeStage = (stage: string | null) => (stage ?? "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().replace(/[ _-]+/g, "");
        for (const event of lifecycleEvents) {
          const batchId = String(event.batch_id ?? "batch_unspecified");
          const unitId = typeof event.experimental_unit_id === "string" ? event.experimental_unit_id : null;
          const key = `${batchId}::${String(unitId ?? "unit_unspecified")}`;
          const group = productionTimelineGroups.get(key) ?? { batch_id: batchId, experimental_unit_id: unitId, induction_events: [], harvest_rows: [] };
          const stage = normalizeStage(event.lifecycle_stage as string | null);
          if (["induction","pinning","primordia","primordiumformation","fructificationinduction"].includes(stage)) {
            const at = Date.parse(String(event.occurred_at));
            if (Number.isFinite(at)) group.induction_events.push({ event_id: String(event.event_id), at });
          }
          productionTimelineGroups.set(key, group);
        }
        for (const record of harvestMassRecords) {
          const batchId = String(record.batch_id ?? "batch_unspecified");
          const unitId = typeof record.experimental_unit_id === "string" ? record.experimental_unit_id : null;
          const key = `${batchId}::${String(unitId ?? "unit_unspecified")}`;
          const group = productionTimelineGroups.get(key) ?? { batch_id: batchId, experimental_unit_id: unitId, induction_events: [], harvest_rows: [] };
          const event = lifecycleEvents.find(candidate => candidate.event_id === record.event_id);
          // The harvest event timestamp is authoritative; observation time is fallback only.
          const at = Date.parse(String(event?.occurred_at ?? record.occurred_at));
          const payload = event?.payload as Record<string, unknown> | undefined;
          const flushRaw = payload?.flush_id ?? payload?.flush_no ?? payload?.flush_number ?? payload?.fruiting_cycle_id;
          const flushKey = typeof flushRaw === "string" || typeof flushRaw === "number" ? String(flushRaw).trim() || null : null;
          group.harvest_rows.push({
            event_id: String(record.event_id),
            at,
            mass_g: typeof record.fresh_mass_g === "number" && Number.isFinite(record.fresh_mass_g) && record.fresh_mass_g >= 0 ? record.fresh_mass_g : null,
            flush_key: flushKey
          });
          productionTimelineGroups.set(key, group);
        }
        const productionTimelines = Array.from(productionTimelineGroups.entries()).map(([key, group]) => {
          const inductionAt = group.induction_events.length ? Math.min(...group.induction_events.map(row => row.at)) : null;
          const harvestRows = group.harvest_rows.filter(row => Number.isFinite(row.at)).sort((a,b) => a.at-b.at);
          const firstHarvestAt = harvestRows.length ? harvestRows[0].at : null;
          const lastHarvestAt = harvestRows.length ? harvestRows[harvestRows.length-1].at : null;
          const validFlushes = new Map<string, number>();
          for (const row of harvestRows) if (row.flush_key && !validFlushes.has(row.flush_key)) validFlushes.set(row.flush_key,row.at);
          const orderedFlushes = Array.from(validFlushes.entries()).sort((a,b)=>a[1]-b[1]);
          const flushIntervals = orderedFlushes.slice(1).map((flush,index)=>({
            previous_flush_id: orderedFlushes[index][0],
            flush_id: flush[0],
            interval_hours: Number(((flush[1]-orderedFlushes[index][1])/3_600_000).toFixed(2)),
            status: flush[1] >= orderedFlushes[index][1] ? "valid" : "invalid_order"
          }));
          let cumulative = 0;
          const cumulativeYieldCurve = orderedFlushes.map(([flushKey,flushAt]) => {
            const rows = harvestRows.filter(row => row.flush_key === flushKey && row.mass_g !== null);
            const flushMass = rows.reduce((sum,row)=>sum+Number(row.mass_g),0);
            cumulative += flushMass;
            return {
              flush_id: flushKey,
              first_harvest_at: new Date(flushAt).toISOString(),
              measured_harvest_event_count: rows.length,
              flush_fresh_mass_g: Number(flushMass.toFixed(3)),
              cumulative_fresh_mass_g: Number(cumulative.toFixed(3))
            };
          });
          const flags: string[] = [];
          if (inductionAt === null) flags.push("induction_stage_not_recorded");
          if (harvestRows.some(row => ambiguousHarvestMassEventIds.includes(row.event_id))) flags.push("ambiguous_harvest_mass_observations");
          if (!harvestRows.length) flags.push("harvest_not_recorded");
          if (harvestRows.some(row => row.mass_g === null)) flags.push("harvest_mass_missing");
          if (group.harvest_rows.some(row => !Number.isFinite(row.at))) flags.push("harvest_timestamp_invalid");
          if (harvestRows.some(row => row.flush_key === null)) flags.push("flush_identifier_missing");
          const inductionToFirstHarvestHours = inductionAt !== null && firstHarvestAt !== null
            ? Number(((firstHarvestAt-inductionAt)/3_600_000).toFixed(2)) : null;
          if (inductionToFirstHarvestHours !== null && inductionToFirstHarvestHours < 0) flags.push("harvest_precedes_induction");
          const productionDurationHours = inductionAt !== null && lastHarvestAt !== null
            ? Number(((lastHarvestAt-inductionAt)/3_600_000).toFixed(2)) : null;
          return {
            grouping_key: key,
            batch_id: group.batch_id,
            experimental_unit_id: group.experimental_unit_id,
            induction_event_ids: group.induction_events.map(row=>row.event_id),
            induction_to_first_harvest_hours: inductionToFirstHarvestHours,
            intervals_between_flushes: flushIntervals,
            production_duration_hours: productionDurationHours !== null && productionDurationHours >= 0 ? productionDurationHours : null,
            production_duration_status: productionDurationHours === null ? "incomplete_timeline" : productionDurationHours < 0 ? "invalid_timeline" : "calculated_from_explicit_events",
            cumulative_yield_curve: cumulativeYieldCurve,
            cumulative_yield_curve_by_event: (() => {
              let runningTotal = 0;
              return harvestRows.map(row => {
                if (row.mass_g !== null) runningTotal += row.mass_g;
                return {
                  event_id: row.event_id,
                  harvested_at: new Date(row.at).toISOString(),
                  fresh_mass_g: row.mass_g,
                  cumulative_fresh_mass_g: Number(runningTotal.toFixed(3)),
                  mass_included: row.mass_g !== null
                };
              });
            })(),
            cumulative_fresh_mass_g: cumulativeYieldCurve.length ? Number(cumulative.toFixed(3)) : null,
            timeline_flags: flags,
            timeline_completeness: flags.length ? "incomplete_or_inconsistent" : "explicit_timeline_available"
          };
        });
        const candidateBatchQuery = admin.from("batches").select("id,batch_code")
          .eq("organization_id", job.organization_id).eq("culture_id", input.culture_id);
        const { data: cultureBatches, error: cultureBatchesError } = await candidateBatchQuery.limit(50);
        if (cultureBatchesError) throw new Error(`mycology_yield_batch_lookup_failed:${cultureBatchesError.message}`);
        const requestedYieldBatchId = typeof input.batch_id === "string" ? input.batch_id : null;
        const yieldBatch = requestedYieldBatchId
          ? (cultureBatches ?? []).find((batch: Record<string, unknown>) => batch.id === requestedYieldBatchId) ?? null
          : (cultureBatches ?? []).length === 1 ? cultureBatches![0] : null;
        let yieldSubstrateProfile: Record<string, unknown> | null = null;
        if (yieldBatch) {
          const { data: profile, error: profileError } = await admin.from("batch_substrate_profiles")
            .select("id,batch_id,initial_dry_mass_kg,record_status,verified_at")
            .eq("organization_id", job.organization_id).eq("batch_id", yieldBatch.id).maybeSingle();
          if (profileError) throw new Error(`mycology_yield_substrate_profile_lookup_failed:${profileError.message}`);
          yieldSubstrateProfile = profile as Record<string, unknown> | null;
        }
        const verifiedDryMassKg = yieldSubstrateProfile?.record_status === "verified"
          && yieldSubstrateProfile?.verified_at
          && typeof yieldSubstrateProfile?.initial_dry_mass_kg === "number"
          && Number.isFinite(yieldSubstrateProfile.initial_dry_mass_kg as number)
          && (yieldSubstrateProfile.initial_dry_mass_kg as number) > 0
          ? yieldSubstrateProfile.initial_dry_mass_kg as number : null;
        const eligibleBatchHarvests = yieldBatch
          ? harvestMassRecords.filter(record => record.batch_id === yieldBatch.id && typeof record.fresh_mass_g === "number"
            && Number.isFinite(record.fresh_mass_g as number) && (record.fresh_mass_g as number) >= 0)
          : [];
        const eligibleFreshMassG = eligibleBatchHarvests.reduce((sum, record) => sum + Number(record.fresh_mass_g), 0);
        const biologicalEfficiencyPct = verifiedDryMassKg !== null && eligibleBatchHarvests.length
          ? Number((eligibleFreshMassG / (verifiedDryMassKg * 1000) * 100).toFixed(2)) : null;
        const lifecycleAnalysis = {
          event_count: lifecycleEvents.length,
          explicit_stage_event_count: explicitStageEvents.length,
          stage_unspecified_event_count: lifecycleEvents.length - explicitStageEvents.length,
          stage_events: stageTransitions,
          harvest_event_count: harvestEvents.length,
          harvest_mass_records: harvestMassRecords,
          linked_harvest_performance_observation_count: linkedHarvestObservationCount,
          known_fresh_mass_total_g: knownHarvestMasses.length
            ? Number(knownHarvestMasses.reduce((sum, record) => sum + Number(record.fresh_mass_g), 0).toFixed(3)) : null,
          harvest_mass_record_coverage_pct: harvestEvents.length
            ? Number((knownHarvestMasses.length / harvestEvents.length * 100).toFixed(1)) : null,
          harvest_by_flush: harvestByFlush,
          production_timelines: productionTimelines,
          production_timeline_count: productionTimelines.length,
          ambiguous_harvest_mass_event_ids: ambiguousHarvestMassEventIds,
          temporal_analysis_policy: "All durations use explicit event timestamps within the same batch and experimental unit; event occurred_at takes precedence over linked observation timestamps. Induction synonyms are limited to explicit lifecycle_stage values. Flush intervals and flush-level curves require explicit flush identifiers. Event-level cumulative yield remains available without a flush identifier. Multiple eligible performance-observation masses on one event are excluded as ambiguous unless the event payload supplies authoritative mass. Incomplete timelines are flagged rather than imputed.",
          harvest_flush_replicate_comparisons: flushReplicateComparisons,
          harvest_flush_replicate_comparison_count: flushReplicateComparisons.length,
          harvest_flush_comparison_policy: "Summaries require explicit flush identifier, registered experimental unit, biological replicate level, unique replicate number, experiment, and treatment code. At least two distinct biological replicates are required for mean and sample SD. Technical replicates and unspecified replicate levels are excluded.",
          harvest_events_without_explicit_flush: unassignedHarvestEvents,
          flush_assignment_policy: "Flush grouping requires an explicit flush_id, flush_no, flush_number, or fruiting_cycle_id in the event payload; no flush is inferred from dates or sequence.",
          yield_reference_batch_id: yieldBatch?.id ?? null,
          yield_reference_batch_code: yieldBatch?.batch_code ?? null,
          substrate_dry_mass_kg: verifiedDryMassKg,
          biological_efficiency_pct: biologicalEfficiencyPct,
          biological_efficiency_status: biologicalEfficiencyPct !== null ? "calculated_from_verified_dry_substrate_mass"
            : !yieldBatch ? "blocked_no_unambiguous_batch_link"
            : !yieldSubstrateProfile ? "blocked_no_substrate_profile"
            : !verifiedDryMassKg ? "blocked_dry_substrate_mass_not_verified"
            : "blocked_no_eligible_batch_harvest_mass",
          biological_efficiency_policy: "BE = cumulative fresh mushroom mass / verified initial dry substrate mass × 100. Both quantities are converted to grams. Only harvest events explicitly linked to the reference batch and with non-negative fresh mass in grams are included.",
          policy: "Stage duration is calculated only between explicitly staged events for the same culture; no missing stage is inferred. Harvest totals include explicit non-negative fresh_mass_g or harvest_mass_g event payload values and event-linked performance observations with explicit fresh-mass metric codes and recognized gram or kilogram units; excluded or invalid quality states are omitted. Flush grouping requires explicit flush identifiers. Biological efficiency requires a unique or requested culture batch and a verified positive initial dry substrate mass in kilograms."
        };
        const suppliedMycologyObservations = Array.isArray(input.observations)
          ? input.observations.filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value))
          : [];
        const mycologyObservations = [...persistedMycologyObservations, ...suppliedMycologyObservations];
        output = interpretMycology({ ...input, observations: mycologyObservations }, profile as Record<string, unknown>);
        const mycologyResult = output as Record<string, unknown>;
        const stageAnnotatedMycologyObservations = mycologyObservations.map((o: Record<string, unknown>) => {
          const context = o.context && typeof o.context === "object" ? o.context as Record<string, unknown> : {};
          const explicitStage = typeof o.lifecycle_stage === "string" ? o.lifecycle_stage : typeof context.lifecycle_stage === "string" ? context.lifecycle_stage : null;
          return {
            ...o,
            lifecycle_stage: explicitStage,
            category: o.variable,
            experimental_unit_id: o.experimental_unit_id ?? context.experimental_unit_id ?? null
          };
        });
        mycologyResult.context_frames = buildContextFrames(stageAnnotatedMycologyObservations, 30);
        mycologyResult.context_frame_count = (mycologyResult.context_frames as unknown[]).length;
        const stageCounts = new Map<string, number>();
        for (const observation of stageAnnotatedMycologyObservations) {
          const stage = typeof observation.lifecycle_stage === "string" && observation.lifecycle_stage.trim()
            ? observation.lifecycle_stage.trim().toLowerCase() : "stage_unspecified";
          stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);
        }
        mycologyResult.lifecycle_stage_coverage = {
          observation_count: stageAnnotatedMycologyObservations.length,
          explicitly_staged_observation_count: stageAnnotatedMycologyObservations.filter(o => typeof o.lifecycle_stage === "string" && o.lifecycle_stage.trim()).length,
          stage_unspecified_observation_count: stageCounts.get("stage_unspecified") ?? 0,
          observations_by_stage: Object.fromEntries(stageCounts),
          stage_assignment_policy: "Lifecycle stage is read only from an explicit observation field or metadata.lifecycle_stage. No stage is inferred from elapsed time, variable names, or expected cultivation sequence."
        };
        mycologyResult.context_frame_policy = "Co-observations are grouped only within the same culture, experimental unit, and explicitly recorded lifecycle stage, using non-overlapping 30-minute windows anchored to the first observation. Unspecified-stage observations are isolated from staged observations. Association is descriptive and does not establish causality.";
        mycologyResult.lifecycle_event_analysis = lifecycleAnalysis;
        mycologyResult.lifecycle_event_count = lifecycleEvents.length;
        mycologyResult.derived_metrics = deriveDescriptiveSeries(mycologyObservations);
        mycologyResult.derived_metric_count = (mycologyResult.derived_metrics as unknown[]).length;
        // The culture's persisted strain-profile link is authoritative.
        // A job payload must not be able to substitute another strain profile.
        const biologicalProfileId = culture.biological_strain_profile_id;
        let biologicalProfile: Record<string, unknown> | null = null;
        if (biologicalProfileId) {
          const { data, error } = await admin.from("biological_strain_profiles")
            .select("id,profile_code,profile_version,scientific_name,strain_code,strain_name,lifecycle_stage,parameter_ranges,evidence,validation_status,valid_from,valid_to")
            .eq("organization_id", job.organization_id).eq("id", biologicalProfileId)
            .eq("validation_status", "validated")
            .lte("valid_from", new Date().toISOString().slice(0,10))
            .or(`valid_to.is.null,valid_to.gte.${new Date().toISOString().slice(0,10)}`)
            .maybeSingle();
          if (error) throw new Error(`biological_strain_profile_lookup_failed:${error.message}`);
          biologicalProfile = data as Record<string, unknown> | null;
        }
        const result = output as Record<string, unknown>;
        const findings = result.findings as Record<string, unknown>[];
        // Substrate composition and thermal-treatment history are batch context,
        // not free-text notes. Resolve only batches belonging to this culture and tenant.
        let batchQuery = admin.from("batches")
          .select("id,batch_code,name,current_stage,started_at,completed_at,location_id,environment_id")
          .eq("organization_id", job.organization_id)
          .eq("culture_id", culture.id);
        const requestedBatchId = typeof input.batch_id === "string" ? input.batch_id : null;
        if (requestedBatchId) batchQuery = batchQuery.eq("id", requestedBatchId);
        const { data: substrateBatch, error: substrateBatchError } = await batchQuery
          .order("started_at", { ascending: false, nullsFirst: false })
          .limit(1).maybeSingle();
        if (substrateBatchError) throw new Error(`mycology_substrate_batch_lookup_failed:${substrateBatchError.message}`);
        if (substrateBatch) {
          const { data: substrateProfile, error: substrateProfileError } = await admin.from("batch_substrate_profiles")
            .select("id,formulation_id,substrate_family,substrate_label,target_moisture_pct,measured_moisture_pct,initial_dry_mass_kg,initial_wet_mass_kg,final_wet_mass_kg,ph_value,ec_ms_cm,supplementation,preparation_notes,record_status,verified_at,composition_basis,total_supplement_pct")
            .eq("organization_id", job.organization_id).eq("batch_id", substrateBatch.id).maybeSingle();
          if (substrateProfileError) throw new Error(`mycology_substrate_profile_lookup_failed:${substrateProfileError.message}`);
          if (substrateProfile) {
            const { data: components, error: componentsError } = await admin.from("batch_substrate_components")
              .select("component_code,component_name,component_role,quantity,unit_code,percentage,percentage_basis,moisture_pct,supplier_lot,sequence_no")
              .eq("organization_id", job.organization_id).eq("substrate_profile_id", substrateProfile.id)
              .order("sequence_no", { ascending: true });
            if (componentsError) throw new Error(`mycology_substrate_components_lookup_failed:${componentsError.message}`);
            const { data: treatments, error: treatmentsError } = await admin.from("substrate_treatment_runs")
              .select("id,treatment_method,treatment_label,equipment_label,batch_load_mass_kg,water_volume_l,water_to_substrate_ratio,target_temperature_c,measured_core_temperature_c,hold_duration_minutes,pressure_kpa,ph_solution,started_at,reached_target_at,completed_at,cooled_to_temperature_c,cooling_completed_at,treatment_status,deviations,heat_up_duration_minutes,drain_duration_minutes,cooling_method,treatment_agent,sensor_id,water_quality_notes,contamination_observation")
              .eq("organization_id", job.organization_id).eq("substrate_profile_id", substrateProfile.id)
              .order("started_at", { ascending: true, nullsFirst: true });
            if (treatmentsError) throw new Error(`mycology_substrate_treatment_lookup_failed:${treatmentsError.message}`);
            const treatmentRows = (treatments ?? []) as Record<string, unknown>[];
            const treatmentIds = treatmentRows.map(t => String(t.id));
            let readingsByRun = new Map<string, Record<string, unknown>[]>();
            if (treatmentIds.length) {
              const { data: readings, error: readingsError } = await admin.from("substrate_treatment_readings")
                .select("treatment_run_id,measured_at,measurement_point,temperature_c,pressure_kpa,ph_value,note")
                .eq("organization_id", job.organization_id).in("treatment_run_id", treatmentIds)
                .order("measured_at", { ascending: true });
              if (readingsError) throw new Error(`mycology_substrate_treatment_readings_lookup_failed:${readingsError.message}`);
              for (const reading of (readings ?? []) as Record<string, unknown>[]) {
                const runId = String(reading.treatment_run_id);
                const rows = readingsByRun.get(runId) ?? [];
                rows.push(reading);
                readingsByRun.set(runId, rows);
              }
            }
            const treatmentProcessAssessments = treatmentRows.map(treatment => {
              const method = String(treatment.treatment_method ?? "");
              const requiredFieldsByMethod: Record<string, string[]> = {
                hot_water: ["batch_load_mass_kg","water_volume_l","started_at","completed_at","drain_duration_minutes","cooling_method"],
                atmospheric_steam: ["batch_load_mass_kg","started_at","reached_target_at","completed_at","hold_duration_minutes"],
                pressurized_steam: ["batch_load_mass_kg","started_at","reached_target_at","completed_at","hold_duration_minutes","pressure_kpa"],
                alkaline_lime: ["treatment_agent","ph_solution","started_at","completed_at"],
                fermentation: ["started_at","completed_at"],
                cold_pasteurization: ["treatment_agent","started_at","completed_at"],
                other: ["started_at","completed_at"]
              };
              const requiredFields = requiredFieldsByMethod[method] ?? requiredFieldsByMethod.other;
              const readings = readingsByRun.get(String(treatment.id)) ?? [];
              const missingFields = requiredFields.filter(field => treatment[field] === null || treatment[field] === undefined || treatment[field] === "");
              const thermalMethod = method === "hot_water" || method === "atmospheric_steam" || method === "pressurized_steam";
              const hasTemperatureEvidence = readings.some(reading => reading.temperature_c !== null && reading.temperature_c !== undefined)
                || treatment.measured_core_temperature_c !== null && treatment.measured_core_temperature_c !== undefined;
              const hasPressureEvidence = readings.some(reading => reading.pressure_kpa !== null && reading.pressure_kpa !== undefined)
                || treatment.pressure_kpa !== null && treatment.pressure_kpa !== undefined;
              const hasPhEvidence = readings.some(reading => reading.ph_value !== null && reading.ph_value !== undefined)
                || treatment.ph_solution !== null && treatment.ph_solution !== undefined;
              const presentCount = requiredFields.length - missingFields.length;
              return {
                treatment_run_id: treatment.id,
                method,
                status: treatment.treatment_status,
                required_record_fields: requiredFields,
                missing_record_fields: missingFields,
                record_completeness_pct: requiredFields.length ? Number((presentCount / requiredFields.length * 100).toFixed(1)) : null,
                reading_count: readings.length,
                temperature_evidence_present: hasTemperatureEvidence,
                pressure_evidence_present: method === "pressurized_steam" ? hasPressureEvidence : null,
                ph_evidence_present: method === "alkaline_lime" ? hasPhEvidence : null,
                deviations_recorded: Array.isArray(treatment.deviations) ? treatment.deviations.length > 0 : Boolean(treatment.deviations),
                process_record_status: treatment.treatment_status !== "completed" ? "incomplete_process"
                  : missingFields.length ? "completed_with_missing_process_records"
                  : thermalMethod && !hasTemperatureEvidence ? "completed_without_temperature_evidence"
                  : method === "pressurized_steam" && !hasPressureEvidence ? "completed_without_pressure_evidence"
                  : method === "alkaline_lime" && !hasPhEvidence ? "completed_without_ph_evidence"
                  : "record_fields_complete",
                interpretation_limit: "Record completeness only; this does not certify pasteurization efficacy, sterilization, microbial reduction, or substrate suitability."
              };
            });
            const { data: experimentalUnits, error: unitsError } = await admin.from("experimental_units")
              .select("id,experiment_id,unit_code,replicate_no,treatment_code")
              .eq("organization_id", job.organization_id).eq("batch_id", substrateBatch.id);
            if (unitsError) throw new Error(`mycology_experimental_units_lookup_failed:${unitsError.message}`);
            const unitIds = (experimentalUnits ?? []).map((u: Record<string, unknown>) => String(u.id));
            let experimentalResults: Record<string, unknown>[] = [];
            if (unitIds.length) {
              const { data, error } = await admin.from("results")
                .select("experimental_unit_id,experiment_id,code,result_type,value,quality_state,created_at")
                .eq("organization_id", job.organization_id).in("experimental_unit_id", unitIds);
              if (error) throw new Error(`mycology_experimental_results_lookup_failed:${error.message}`);
              experimentalResults = (data ?? []) as Record<string, unknown>[];
            }

            result.substrate_context = {
              batch: substrateBatch,
              profile: substrateProfile,
              components: components ?? [],
              treatments: treatmentRows.map(t => ({
                ...t,
                readings: readingsByRun.get(String(t.id)) ?? [],
              })),
              treatment_process_assessments: treatmentProcessAssessments,
              treatment_process_assessment_count: treatmentProcessAssessments.length,
              treatment_process_assessment_policy: "Method-specific field completeness and presence of recorded process evidence only; no efficacy or microbial-kill claim is inferred.",
              experimental_units: experimentalUnits ?? [],
              experimental_results: experimentalResults,
            };
            if (substrateProfile.record_status !== "verified") findings.push({
              code: "substrate_profile_not_verified", severity: "information",
              message: "Substrate composition is recorded but not verified; do not use it as validated comparison context.",
              batch_id: substrateBatch.id,
              record_status: substrateProfile.record_status,
            });
            if (!(components ?? []).length) findings.push({
              code: "substrate_composition_not_recorded", severity: "information",
              message: "No structured substrate component rows are recorded for this batch.",
              batch_id: substrateBatch.id,
            });
            if (!treatmentRows.length) findings.push({
              code: "substrate_treatment_not_recorded", severity: "information",
              message: "No pasteurization or substrate-treatment run is recorded for this batch.",
              batch_id: substrateBatch.id,
            });
          } else {
            findings.push({
              code: "substrate_profile_not_recorded", severity: "information",
              message: "The linked production batch has no structured substrate profile.",
              batch_id: substrateBatch.id,
            });
          }
        } else {
          findings.push({
            code: "mycology_batch_not_linked", severity: "information",
            message: "No production batch linked to this culture was resolved; substrate composition and treatment cannot be contextualized.",
          });
        }
        // Production outcomes are independent from substrate-profile availability.
        // Keep raw observations intact and classify comparison eligibility without
        // deriving biological conclusions from incomplete or estimated records.
        let productionObservations: Record<string, unknown>[] = [];
        let productionMetricDefinitions: Record<string, unknown>[] = [];
        let productionUnitDefinitions: Record<string, unknown>[] = [];
        if (substrateBatch) {
          const { data: performanceRows, error: performanceError } = await admin.from("batch_performance_observations")
            .select("id,metric_code,numeric_value,text_value,unit_code,observed_at,measurement_method,instrument,quality_state,exclusion_reason,metadata,experimental_unit_id,event_id")
            .eq("organization_id", job.organization_id).eq("batch_id", substrateBatch.id)
            .neq("quality_state", "excluded")
            .order("observed_at", { ascending: true });
          if (performanceError) throw new Error(`mycology_batch_performance_lookup_failed:${performanceError.message}`);
          productionObservations = (performanceRows ?? []) as Record<string, unknown>[];
          const metricCodes = [...new Set(productionObservations.map(o => String(o.metric_code ?? "")).filter(Boolean))];
          if (metricCodes.length) {
            const { data, error } = await admin.from("variables")
              .select("code,label,dimension,canonical_unit_code,description")
              .in("code", metricCodes);
            if (error) throw new Error(`mycology_metric_dictionary_lookup_failed:${error.message}`);
            productionMetricDefinitions = (data ?? []) as Record<string, unknown>[];
          }
          const unitCodes = [...new Set(productionObservations.map(o => String(o.unit_code ?? "")).filter(Boolean))];
          const canonicalCodes = [...new Set(productionMetricDefinitions.map(m => String(m.canonical_unit_code ?? "")).filter(Boolean))];
          const allUnitCodes = [...new Set([...unitCodes, ...canonicalCodes])];
          if (allUnitCodes.length) {
            const { data, error } = await admin.from("units")
              .select("code,label,dimension,factor,offset_value,is_linear")
              .in("code", allUnitCodes);
            if (error) throw new Error(`mycology_unit_dictionary_lookup_failed:${error.message}`);
            productionUnitDefinitions = (data ?? []) as Record<string, unknown>[];
          }
        }
        const metricByCode = new Map(productionMetricDefinitions.map(m => [String(m.code), m]));
        const unitByCode = new Map(productionUnitDefinitions.map(u => [String(u.code), u]));
        const classifiedProductionObservations = productionObservations.map(observation => {
          const metric = metricByCode.get(String(observation.metric_code));
          const observedUnit = unitByCode.get(String(observation.unit_code));
          const canonicalUnit = metric?.canonical_unit_code ? unitByCode.get(String(metric.canonical_unit_code)) : null;
          let unitStatus = "not_applicable";
          if (observation.numeric_value !== null && observation.numeric_value !== undefined) {
            if (!metric) unitStatus = "unknown_metric";
            else if (!observedUnit) unitStatus = "unknown_unit";
            else if (!canonicalUnit) unitStatus = "canonical_unit_missing";
            else if (observedUnit.dimension !== canonicalUnit.dimension || metric.dimension !== canonicalUnit.dimension) unitStatus = "dimension_mismatch";
            else unitStatus = String(observation.unit_code) === String(metric.canonical_unit_code) ? "canonical" : "convertible";
          }
          const qualityState = String(observation.quality_state ?? "");
          const qualityEligible = qualityState === "observed" || qualityState === "validated";
          const comparisonEligible = Boolean(metric) && unitStatus === "canonical"
            && qualityEligible && observation.numeric_value !== null && observation.numeric_value !== undefined;
          return {
            ...observation,
            metric_definition: metric ?? null,
            unit_status: unitStatus,
            comparison_eligible: comparisonEligible,
            comparison_exclusion_reason: comparisonEligible ? null :
              (!metric ? "metric_not_registered" :
              (unitStatus === "dimension_mismatch" || unitStatus === "unknown_unit" || unitStatus === "canonical_unit_missing" ? unitStatus :
              (unitStatus === "convertible" ? "unit_conversion_not_applied" :
              (!qualityEligible ? `quality_state_${qualityState || "missing"}_not_eligible` : "numeric_value_required")))),
          };
        });
        const treatmentOutcomeGroups = new Map<string, { experiment_id: string | null; treatment_code: string | null; metric_code: string; unit_code: string; values: number[]; replicate_numbers: Set<number>; unit_ids: Set<string>; methods: Set<string>; instruments: Set<string>; }>();
        const unitById = new Map(((result.substrate_context && typeof result.substrate_context === "object"
          ? (result.substrate_context as Record<string, unknown>).experimental_units : []) as Record<string, unknown>[] ?? [])
          .map(unit => [String(unit.id), unit]));
        const substrateProfileVerified = Boolean(result.substrate_context
          && typeof result.substrate_context === "object"
          && (result.substrate_context as Record<string, unknown>).profile
          && ((result.substrate_context as Record<string, unknown>).profile as Record<string, unknown>).record_status === "verified");
        const completedTreatmentRuns = ((result.substrate_context && typeof result.substrate_context === "object"
          ? (result.substrate_context as Record<string, unknown>).treatments : []) as Record<string, unknown>[] ?? [])
          .filter(run => run.treatment_status === "completed");
        for (const observation of classifiedProductionObservations) {
          if (!observation.comparison_eligible || !observation.experimental_unit_id) continue;
          const unit = unitById.get(String(observation.experimental_unit_id));
          if (!unit || unit.replicate_no === null || unit.replicate_no === undefined) continue;
          const value = Number(observation.numeric_value);
          if (!Number.isFinite(value)) continue;
          const metricCode = String(observation.metric_code);
          const unitCode = String(observation.unit_code);
          const treatmentCode = unit.treatment_code == null ? null : String(unit.treatment_code);
          if (!treatmentCode) continue;
          const methodCode = observation.measurement_method == null ? "unspecified_method" : String(observation.measurement_method);
          const instrumentCode = observation.instrument == null ? "unspecified_instrument" : String(observation.instrument);
          const key = [unit.experiment_id ?? "", treatmentCode, metricCode, unitCode, methodCode, instrumentCode].join("|");
          const group = treatmentOutcomeGroups.get(key) ?? {
            experiment_id: unit.experiment_id == null ? null : String(unit.experiment_id),
            treatment_code: treatmentCode, metric_code: metricCode, unit_code: unitCode,
            values: [], replicate_numbers: new Set<number>(), unit_ids: new Set<string>(), methods: new Set<string>(), instruments: new Set<string>()
          };
          group.values.push(value);
          group.replicate_numbers.add(Number(unit.replicate_no));
          group.unit_ids.add(String(unit.id));
          if (observation.measurement_method) group.methods.add(String(observation.measurement_method));
          if (observation.instrument) group.instruments.add(String(observation.instrument));
          treatmentOutcomeGroups.set(key, group);
        }
        const treatmentOutcomeComparisons = [...treatmentOutcomeGroups.values()]
          .filter(group => substrateProfileVerified && completedTreatmentRuns.length > 0
            && group.replicate_numbers.size >= 2 && group.values.length >= 2)
          .map(group => {
            const sorted = [...group.values].sort((a,b)=>a-b);
            const mean = sorted.reduce((sum,value)=>sum+value,0)/sorted.length;
            const variance = sorted.length > 1
              ? sorted.reduce((sum,value)=>sum+(value-mean)**2,0)/(sorted.length-1) : 0;
            return {
              experiment_id: group.experiment_id,
              treatment_code: group.treatment_code,
              metric_code: group.metric_code,
              unit_code: group.unit_code,
              replicate_count: group.replicate_numbers.size,
              observation_count: group.values.length,
              mean: Number(mean.toFixed(6)),
              sample_sd: Number(Math.sqrt(variance).toFixed(6)),
              min: sorted[0], max: sorted[sorted.length-1],
              experimental_unit_ids: [...group.unit_ids],
              measurement_methods: [...group.methods],
              instruments: [...group.instruments],
              substrate_profile_verified: true,
              completed_treatment_run_count: completedTreatmentRuns.length,
              interpretation: "descriptive_experimental_assignment_summary",
              treatment_run_attribution: "batch_level_unlinked_to_experimental_unit",
              causal_claim: false
            };
          });
        const treatmentOutcomeComparisonStatus = !substrateProfileVerified
          ? "blocked_unverified_substrate_profile"
          : completedTreatmentRuns.length === 0
            ? "blocked_no_completed_treatment_run"
            : treatmentOutcomeComparisons.length === 0
              ? "insufficient_replicated_eligible_outcomes"
              : "descriptive_summaries_available";
        const substrateProfileForComparison = result.substrate_context && typeof result.substrate_context === "object"
          ? (result.substrate_context as Record<string, unknown>).profile as Record<string, unknown> | null
          : null;
        const substrateComponentsForComparison = result.substrate_context && typeof result.substrate_context === "object"
          ? ((result.substrate_context as Record<string, unknown>).components as Record<string, unknown>[] ?? [])
          : [];
        const substrateTreatmentsForComparison = result.substrate_context && typeof result.substrate_context === "object"
          ? ((result.substrate_context as Record<string, unknown>).treatments as Record<string, unknown>[] ?? [])
          : [];
        const experimentalContextFactors = {
          batch_id: substrateBatch?.id ?? null,
          batch_location_id: substrateBatch?.location_id ?? null,
          batch_environment_id: substrateBatch?.environment_id ?? null,
          culture_id: culture.id,
          biological_strain_profile_id: biologicalProfile?.id ?? null,
          substrate_profile_id: substrateProfileForComparison?.id ?? null,
          substrate_profile_verified: substrateProfileVerified,
          substrate_family: substrateProfileForComparison?.substrate_family ?? null,
          substrate_label: substrateProfileForComparison?.substrate_label ?? null,
          composition_basis: substrateProfileForComparison?.composition_basis ?? null,
          target_moisture_pct: substrateProfileForComparison?.target_moisture_pct ?? null,
          measured_moisture_pct: substrateProfileForComparison?.measured_moisture_pct ?? null,
          ph_value: substrateProfileForComparison?.ph_value ?? null,
          ec_ms_cm: substrateProfileForComparison?.ec_ms_cm ?? null,
          component_count: substrateComponentsForComparison.length,
          treatment_run_count: substrateTreatmentsForComparison.length,
          completed_treatment_run_count: completedTreatmentRuns.length,
          treatment_methods_recorded: [...new Set(substrateTreatmentsForComparison.map(t => String(t.treatment_method ?? "")).filter(Boolean))],
          treatment_equipment_recorded: [...new Set(substrateTreatmentsForComparison.map(t => String(t.equipment_label ?? "")).filter(Boolean))],
          environmental_context_link_count: Number((mycologyResult as Record<string, unknown>).environmental_context_link_count ?? 0),
          known_confounder_policy: "Recorded factors are exposed but not statistically adjusted unless experimental design and unit-level linkage are explicitly available."
        };
        result.production_context = {
          batch: substrateBatch ?? null,
          observations: classifiedProductionObservations,
          metric_definitions: productionMetricDefinitions,
          unit_definitions: productionUnitDefinitions,
          observation_count: classifiedProductionObservations.length,
          comparison_eligible_count: classifiedProductionObservations.filter(o => o.comparison_eligible).length,
          comparison_excluded_count: classifiedProductionObservations.filter(o => !o.comparison_eligible).length,
          comparison_policy: "Only registered metrics recorded in their exact canonical unit and with observed/validated numeric quality are eligible. Unit conversion is deliberately deferred; convertible units remain excluded until normalization is implemented.",
          treatment_outcome_comparisons: treatmentOutcomeComparisons,
          treatment_outcome_comparison_count: treatmentOutcomeComparisons.length,
          treatment_outcome_comparison_status: treatmentOutcomeComparisonStatus,
          treatment_outcome_comparison_policy: "Summaries require a verified substrate profile, at least one completed treatment run, canonical-unit observed/validated performance records, and at least two distinct replicate numbers within the same experiment and treatment code. Groups require an explicit experimental-unit treatment_code and are not pooled across measurement methods or instruments. Treatment runs are linked to the batch substrate profile, not directly to experimental units; these summaries describe experimental assignment strata within the batch and do not attribute outcomes to a specific treatment run. No between-run or between-batch treatment effect is computed. These are descriptive summaries, not causal treatment effects.",
          experimental_context_factors: experimentalContextFactors,
          confounder_adjustment_status: "not_adjusted_no_unit_level_factor_linkage",
          between_treatment_effect_status: "not_computed_no_treatment_run_to_unit_link",
        };
        if (result.substrate_context && typeof result.substrate_context === "object") {
          (result.substrate_context as Record<string, unknown>).performance_observations = classifiedProductionObservations;
        }
        if (!substrateBatch) {
          findings.push({
            code: "production_batch_not_linked",
            severity: "information",
            message: "No production batch is linked; production performance observations cannot be loaded.",
          });
        } else if (classifiedProductionObservations.length === 0) {
          findings.push({
            code: "production_performance_not_recorded",
            severity: "information",
            message: "The production batch has no non-excluded performance observations yet.",
            batch_id: substrateBatch.id,
          });
        }
        for (const observation of classifiedProductionObservations) {
          if (!observation.comparison_eligible) {
            findings.push({
              code: "production_observation_not_comparison_eligible",
              severity: "information",
              metric_code: observation.metric_code,
              observation_id: observation.id,
              reason: observation.comparison_exclusion_reason,
            });
          }
        }
        if (!biologicalProfile) {
          findings.push({
            code: biologicalProfileId ? "biological_profile_not_validated_or_out_of_date" : "biological_profile_not_linked",
            severity: "information",
            message: "No validated strain-and-stage reference profile is linked; biological suitability cannot be assessed.",
          });
        } else {
          const today = new Date().toISOString().slice(0,10);
          const { data: evidenceRows, error: evidenceError } = await admin.from("biological_profile_evidence")
            .select("id,source_id,evidence_role,claim_text,parameter_code,lifecycle_stage,reported_value,experimental_conditions,evidence_strength,page_or_section,extraction_notes,reviewed_at")
            .eq("organization_id", job.organization_id)
            .eq("biological_profile_id", biologicalProfile.id);
          if (evidenceError) throw new Error(`biological_profile_evidence_lookup_failed:${evidenceError.message}`);
          const evidenceItems = (evidenceRows ?? []) as Record<string, unknown>[];
          const sourceIds = [...new Set(evidenceItems.map(e => String(e.source_id)).filter(Boolean))];
          let sourceById = new Map<string, Record<string, unknown>>();
          if (sourceIds.length) {
            const { data: sourceRows, error: sourceError } = await admin.from("biological_reference_sources")
              .select("id,source_type,title,authors,publication_year,journal_or_publisher,doi,url,source_quality,peer_reviewed")
              .eq("organization_id", job.organization_id).in("id", sourceIds);
            if (sourceError) throw new Error(`biological_reference_sources_lookup_failed:${sourceError.message}`);
            sourceById = new Map(((sourceRows ?? []) as Record<string, unknown>[]).map(s => [String(s.id), s]));
          }
          result.biological_evidence = evidenceItems.map(e => ({
            id: e.id,
            role: e.evidence_role,
            claim: e.claim_text,
            parameter: e.parameter_code,
            lifecycle_stage: e.lifecycle_stage,
            reported_value: e.reported_value,
            experimental_conditions: e.experimental_conditions,
            strength: e.evidence_strength,
            section: e.page_or_section,
            extraction_notes: e.extraction_notes,
            reviewed: Boolean(e.reviewed_at),
            source: sourceById.get(String(e.source_id)) ?? null,
          }));
          const { data: references, error: referenceError } = await admin.from("biological_parameter_references")
            .select("id,parameter_code,parameter_label,reference_kind,minimum_value,maximum_value,unit_code,severity,evidence,valid_from,valid_to")
            .eq("organization_id", job.organization_id)
            .eq("biological_profile_id", biologicalProfile.id)
            .eq("validation_status", "validated")
            .in("reference_kind", ["tolerance_limit", "alerting_interval"])
            .lte("valid_from", today)
            .or(`valid_to.is.null,valid_to.gte.${today}`);
          if (referenceError) throw new Error(`biological_parameter_references_lookup_failed:${referenceError.message}`);
          const referenceRows = (references ?? []) as Record<string, unknown>[];
          const referenceIds = referenceRows.map(r => String(r.id));
          const linkedEvidenceByReference = new Map<string, string[]>();
          if (referenceIds.length) {
            const { data: referenceEvidenceLinks, error: linkError } = await admin.from("biological_parameter_reference_evidence")
              .select("parameter_reference_id,profile_evidence_id")
              .eq("organization_id", job.organization_id)
              .in("parameter_reference_id", referenceIds);
            if (linkError) throw new Error(`biological_parameter_reference_evidence_lookup_failed:${linkError.message}`);
            for (const link of (referenceEvidenceLinks ?? []) as Record<string, unknown>[]) {
              const refId = String(link.parameter_reference_id);
              const ids = linkedEvidenceByReference.get(refId) ?? [];
              ids.push(String(link.profile_evidence_id));
              linkedEvidenceByReference.set(refId, ids);
            }
          }
          result.biological_parameter_references = referenceRows.map(reference => ({
            id: reference.id,
            parameter_code: reference.parameter_code,
            parameter_label: reference.parameter_label,
            reference_kind: reference.reference_kind,
            minimum_value: reference.minimum_value,
            maximum_value: reference.maximum_value,
            unit_code: reference.unit_code,
            severity: reference.severity,
            lifecycle_stage: Array.isArray(reference.evidence) ? (reference.evidence as Record<string, unknown>[])[0]?.lifecycle_stage ?? null : null,
            linked_evidence_ids: linkedEvidenceByReference.get(String(reference.id)) ?? [],
          }));
          const biologicalEvidenceById = new Map(evidenceItems.map(e => [String(e.id), e]));
          for (const reference of referenceRows) {
            const variable = String(reference.parameter_code);
            const min = reference.minimum_value === null || reference.minimum_value === undefined || reference.minimum_value === ""
              ? null : Number(reference.minimum_value);
            const max = reference.maximum_value === null || reference.maximum_value === undefined || reference.maximum_value === ""
              ? null : Number(reference.maximum_value);
            if ((min !== null && !Number.isFinite(min)) || (max !== null && !Number.isFinite(max))) {
              findings.push({ code: "biological_reference_invalid_numeric_bound", severity: "warning", reference_id: reference.id, variable });
              continue;
            }
            const expectedUnit = String(reference.unit_code);
            const referenceStage = Array.isArray(reference.evidence)
              ? String(((reference.evidence as Record<string, unknown>[])[0] ?? {}).lifecycle_stage ?? "")
              : "";
            const matching = (input.observations as Record<string, unknown>[]).filter(o => {
              const observationStage = String(o.lifecycle_stage ?? o.stage ?? "").trim();
              return String(o.variable ?? o.parameter ?? o.metric ?? "").trim().toLowerCase() === variable.toLowerCase()
                && typeof o.value === "number" && Number.isFinite(o.value)
                && (!referenceStage || observationStage === referenceStage);
            });
            for (const observation of matching) {
              if (observation.unit !== expectedUnit) {
                findings.push({ code: "biological_reference_unit_mismatch", severity: "warning", variable, observed_unit: observation.unit ?? null, expected_unit: expectedUnit, reference_id: reference.id, profile_id: biologicalProfile.id });
                continue;
              }
              const value = observation.value as number;
              if ((min !== null && value < min) || (max !== null && value > max)) {
                findings.push({
                  code: "biological_reference_range_exceeded",
                  severity: reference.severity,
                  reference_kind: reference.reference_kind,
                  variable, observed_value: value, unit: expectedUnit,
                  reference_min: min, reference_max: max,
                  lifecycle_stage: referenceStage || null,
                  strain_code: biologicalProfile.strain_code,
                  profile_id: biologicalProfile.id,
                  reference_id: reference.id,
                  evidence: reference.evidence,
                  linked_evidence: (linkedEvidenceByReference.get(String(reference.id)) ?? [])
                    .map(id => biologicalEvidenceById.get(id))
                    .filter(Boolean)
                    .map(e => ({ id: e.id, claim: e.claim_text, strength: e.evidence_strength, role: e.evidence_role })),
                  interpretation: "Observation outside the validated tolerance/alert interval; contextual review required before intervention.",
                });
              }
            }
          }
          result.biological_profile = {
            id: biologicalProfile.id, code: biologicalProfile.profile_code,
            version: biologicalProfile.profile_version, scientific_name: biologicalProfile.scientific_name,
            strain_code: biologicalProfile.strain_code, lifecycle_stage: biologicalProfile.lifecycle_stage,
            validation_status: biologicalProfile.validation_status,
          };
          result.limitations = (result.limitations as string[]).filter(x => !x.includes("No species- or strain-specific thresholds"));
          result.limitations.push("Range comparisons use only validated, current, organization-scoped strain-stage profiles and require contextual review.");
        }
        }
      } else if (target.execution_mode === "edge_function") {
      const endpoint = String(target.entrypoint ?? "");
      if (!/^[a-z0-9-]+$/.test(endpoint)) throw new Error("invalid_engine_entrypoint");

      const controller = new AbortController();
      const timeoutMs = Math.max(5, Math.min(300, Number(target.timeout_seconds ?? 90))) * 1000;
      const timeoutId = setTimeout(() => controller.abort("engine_timeout"), timeoutMs);
      let heartbeatBusy = false;
      const heartbeatId = setInterval(async () => {
        if (heartbeatBusy || heartbeatFailure) return;
        heartbeatBusy = true;
        try {
          const { error } = await admin.rpc("heartbeat_engine_job", { p_job_id: job.job_id, p_lease_token: job.lease_token, p_lease_seconds: leaseSeconds });
          if (error) { heartbeatFailure = error.message; controller.abort("lease_heartbeat_failed"); }
        } catch (e) {
          heartbeatFailure = e instanceof Error ? e.message : "heartbeat_unknown_error";
          controller.abort("lease_heartbeat_failed");
        } finally { heartbeatBusy = false; }
      }, 45_000);

      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/${endpoint}`, {
          method: "POST",
          headers: {
            "authorization": `Bearer ${serviceKey}`, "apikey": serviceKey, "content-type": "application/json",
            "x-ba-engine-job-id": job.job_id, "x-ba-engine-contract": job.contract_version, "x-ba-engine-code": target.engine_code,
          },
          body: JSON.stringify(input), signal: controller.signal,
        });
        if (heartbeatFailure) throw new Error(`lease_heartbeat_failed:${heartbeatFailure}`);
        const contentType = response.headers.get("content-type") ?? "";
        if (!response.ok) {
          const raw = await response.text();
          let parsed: unknown;
          try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = { raw_text: raw.slice(0, 1500) }; }
          throw new Error(`engine_http_${response.status}:${JSON.stringify(parsed).slice(0, 1200)}`);
        }
        if (contentType.toLowerCase().startsWith("image/png")) {
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes.byteLength > 5_000_000) throw new Error("engine_image_output_exceeds_5mb");
          let binary = "";
          const chunkSize = 0x8000;
          for (let offset = 0; offset < bytes.length; offset += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
          }
          output = {
            content_type: "image/png",
            image_base64: btoa(binary),
            geo_bounds: response.headers.get("x-geo-bounds"),
            image_date: response.headers.get("x-image-date"),
            image_source: response.headers.get("x-image-source"),
            ndvi_stats: response.headers.get("x-ndvi-stats") ? JSON.parse(response.headers.get("x-ndvi-stats")!) : null,
          };
        } else {
          const raw = await response.text();
          let parsed: unknown;
          try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = { raw_text: raw.slice(0, 1500) }; }
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("engine_output_must_be_json_object");
          output = parsed as Record<string, unknown>;
        }
      } finally { clearTimeout(timeoutId); clearInterval(heartbeatId); }
      }
      if (output) {
        const formulaDomain = target.engine_code === "mycology.interpreter" ? "mycology"
          : target.engine_code === "greentech.interpreter" ? "greentech"
          : target.engine_code === "lab.interpreter" ? "lab" : "cross_domain";
        if (Array.isArray(input.replicate_requests)) {
          output.replicate_summaries = await buildReplicateSummaries(admin, job.organization_id, formulaDomain, input.replicate_requests);
          output.replicate_summary_count = (output.replicate_summaries as Record<string, unknown>[]).filter((r) => r.status === "summarized").length;
        }
        if (Array.isArray(input.series_requests)) {
          const preparedSeries = await buildMeasurementSeriesRequests(admin, job.organization_id, formulaDomain, input.series_requests);
          const seriesResults = await runRegisteredFormulaRequests(admin, job.organization_id, formulaDomain,
            preparedSeries.filter((r) => r.status !== "rejected"), job.job_id);
          output.series_results = [...preparedSeries.filter((r) => r.status === "rejected"), ...seriesResults];
          output.series_result_count = seriesResults.filter((r) => r.status === "calculated").length;
        }
        if (Array.isArray(input.formula_requests)) {
          const formulaResults = await runRegisteredFormulaRequests(admin, job.organization_id, formulaDomain, input.formula_requests, job.job_id);
          output.formula_results = formulaResults;
          output.formula_result_count = formulaResults.filter((r) => r.status === "calculated").length;
        }
      }
    } catch (e) {
      failure = { code: "engine_execution_failed", message: e instanceof Error ? e.message.slice(0, 1800) : "unknown_error", engine_code: job.engine_code, attempt: job.attempt };
    }

    if (failure) {
      const retryDelay = Math.min(1800, 15 * (2 ** Math.max(0, job.attempt - 1)));
      const { error: finishError } = await admin.rpc("finish_engine_job", {
        p_job_id: job.job_id, p_lease_token: job.lease_token, p_status: "failed", p_output: null, p_error: failure, p_retry_delay_seconds: retryDelay,
      });
      results.push({ job_id: job.job_id, engine_code: job.engine_code, status: finishError ? "finish_failed" : "failed", attempt: job.attempt, error: failure, finish_error: finishError?.message ?? null });
      if (finishError) break;
    } else {
      const { error: finishError } = await admin.rpc("finish_engine_job", {
        p_job_id: job.job_id, p_lease_token: job.lease_token, p_status: "succeeded", p_output: output, p_error: null, p_retry_delay_seconds: 0,
      });
      results.push({ job_id: job.job_id, engine_code: job.engine_code, status: finishError ? "finish_failed" : "succeeded", attempt: job.attempt, output, finish_error: finishError?.message ?? null });
      if (finishError) break;
    }
  }

  return json(200, { ok: results.every((r) => r.status !== "finish_failed"), worker_id: workerId, processed: results.length, idle: results.length === 0, results });
});