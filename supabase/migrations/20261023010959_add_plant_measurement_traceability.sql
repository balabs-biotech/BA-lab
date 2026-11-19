ALTER TABLE public.events
  ADD COLUMN plant_culture_id uuid;

ALTER TABLE public.events
  ADD CONSTRAINT events_organization_plant_culture_fk
  FOREIGN KEY (organization_id, plant_culture_id)
  REFERENCES public.plant_cultures (organization_id, id);

ALTER TABLE public.measurements
  ADD COLUMN plant_culture_id uuid;

ALTER TABLE public.measurements
  ADD CONSTRAINT measurements_organization_plant_culture_fk
  FOREIGN KEY (organization_id, plant_culture_id)
  REFERENCES public.plant_cultures (organization_id, id);

ALTER TABLE public.observations
  ADD COLUMN plant_culture_id uuid;

ALTER TABLE public.observations
  ADD CONSTRAINT observations_organization_plant_culture_fk
  FOREIGN KEY (organization_id, plant_culture_id)
  REFERENCES public.plant_cultures (organization_id, id);

CREATE INDEX events_plant_culture_idx
  ON public.events (organization_id, plant_culture_id, occurred_at DESC)
  WHERE plant_culture_id IS NOT NULL;

CREATE INDEX measurements_plant_culture_idx
  ON public.measurements (organization_id, plant_culture_id, measured_at DESC)
  WHERE plant_culture_id IS NOT NULL;

CREATE INDEX observations_plant_culture_idx
  ON public.observations (organization_id, plant_culture_id, observed_at DESC)
  WHERE plant_culture_id IS NOT NULL;