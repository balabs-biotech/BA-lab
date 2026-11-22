CREATE INDEX IF NOT EXISTS plant_cultures_org_environment_fk_idx ON public.plant_cultures (organization_id, environment_id);
CREATE INDEX IF NOT EXISTS plant_cultures_org_location_fk_idx ON public.plant_cultures (organization_id, location_id);
