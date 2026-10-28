/* B.A. LABS domain rules — kept independent from the tracker UI. */
(function attachBALabsDomainEngine(root) {
  "use strict";

  const DOMAINS = Object.freeze({
    agronomy: Object.freeze({
      cultureTypeCodes: Object.freeze([]),
      measurementCodes: Object.freeze([
        "co2_concentration", "electrical_conductivity", "illuminance", "ph",
        "relative_humidity", "root_length", "shoot_length", "substrate_moisture",
        "temperature", "fresh_mass", "dry_mass", "wet_biomass", "volume"
      ])
    }),
    mycology: Object.freeze({
      cultureTypeCodes: Object.freeze([
        "agar", "plate", "slant", "broth", "flask", "other_liquid", "grain_spawn",
        "substrate", "fermentation", "other"
      ]),
      measurementCodes: Object.freeze([
        "cfu", "cfu_per_ml", "co2_concentration", "colony_count", "dry_biomass",
        "electrical_conductivity", "fresh_mass", "generation_time", "growth_rate",
        "incubation_time", "od600", "ph", "relative_humidity", "temperature",
        "viability", "volume", "wet_biomass"
      ])
    }),
    laboratory: Object.freeze({
      cultureTypeCodes: null,
      measurementCodes: null
    })
  });

  function normalizeDomain(domain) {
    return Object.prototype.hasOwnProperty.call(DOMAINS, domain) ? domain : "laboratory";
  }

  function filterCultureTypes(types, domain) {
    const config = DOMAINS[normalizeDomain(domain)];
    if (config.cultureTypeCodes === null) return [...types];
    const allowed = new Set(config.cultureTypeCodes);
    return types.filter(item => allowed.has(item.code));
  }

  function filterMeasurementVariables(variables, domain) {
    const config = DOMAINS[normalizeDomain(domain)];
    if (config.measurementCodes === null) return [...variables];
    const allowed = new Set(config.measurementCodes);
    return variables.filter(variable => allowed.has(variable.code));
  }

  root.BALabsDomainEngine = Object.freeze({
    domains: Object.freeze(Object.keys(DOMAINS)),
    normalizeDomain,
    filterCultureTypes,
    filterMeasurementVariables
  });
})(window);
