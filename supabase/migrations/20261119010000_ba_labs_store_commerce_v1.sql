-- BA Labs Store: isolated guest-commerce schema and least-privilege boundary.
-- The existing orders/order_items tables remain reserved for authenticated tenant workflows.

CREATE TABLE public.store_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code text NOT NULL UNIQUE CHECK (btrim(product_code) <> ''),
  slug text NOT NULL UNIQUE CHECK (btrim(slug) <> ''),
  family text NOT NULL CHECK (family IN ('liquid', 'agar', 'kit', 'substrate', 'biostimulant', 'other')),
  organism_label text NOT NULL,
  title_i18n jsonb NOT NULL CHECK (jsonb_typeof(title_i18n) = 'object'),
  description_i18n jsonb NOT NULL CHECK (jsonb_typeof(description_i18n) = 'object'),
  source_notion_url text,
  publication_status text NOT NULL DEFAULT 'draft'
    CHECK (publication_status IN ('draft', 'published', 'archived')),
  passport_enabled boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.store_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.store_products(id) ON DELETE RESTRICT,
  variant_code text NOT NULL UNIQUE CHECK (btrim(variant_code) <> ''),
  label_i18n jsonb NOT NULL CHECK (jsonb_typeof(label_i18n) = 'object'),
  unit_code text NOT NULL,
  pack_quantity numeric(12,3) NOT NULL DEFAULT 1 CHECK (pack_quantity > 0),
  price_mode text NOT NULL DEFAULT 'quote'
    CONSTRAINT store_variants_price_mode_check CHECK (price_mode IN ('fixed', 'quote')),
  price_dzd bigint,
  availability text NOT NULL DEFAULT 'made_to_order'
    CHECK (availability IN ('available', 'made_to_order', 'out_of_stock', 'hidden')),
  stock_quantity numeric(12,3) CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  lead_time_days integer CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_variants_price_consistency_check CHECK (
    (price_mode = 'fixed' AND price_dzd IS NOT NULL AND price_dzd >= 0)
    OR (price_mode = 'quote' AND price_dzd IS NULL)
  )
);

CREATE TABLE public.store_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code text NOT NULL UNIQUE CHECK (btrim(order_code) <> ''),
  status text NOT NULL DEFAULT 'pending_confirmation'
    CHECK (status IN (
      'pending_confirmation', 'contacting_customer', 'confirmed', 'preparing',
      'ready_for_pickup', 'shipped', 'completed', 'on_hold', 'cancelled'
    )),
  payment_status text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'payment_pending', 'paid', 'refunded')),
  payment_method text NOT NULL DEFAULT 'to_be_agreed'
    CHECK (payment_method IN ('to_be_agreed', 'cash_on_pickup', 'cash_on_delivery', 'bank_transfer', 'other')),
  delivery_mode text NOT NULL CHECK (delivery_mode IN ('pickup', 'shipping')),
  locale text NOT NULL DEFAULT 'fr' CHECK (locale IN ('fr', 'en', 'ar', 'pt')),
  customer_name text NOT NULL CHECK (length(btrim(customer_name)) BETWEEN 2 AND 160),
  customer_phone text NOT NULL CHECK (length(btrim(customer_phone)) BETWEEN 6 AND 40),
  customer_email text CHECK (customer_email IS NULL OR length(customer_email) <= 254),
  company_name text CHECK (company_name IS NULL OR length(company_name) <= 180),
  delivery_address text,
  delivery_wilaya text,
  delivery_commune text,
  delivery_instructions text,
  currency char(3) NOT NULL DEFAULT 'DZD' CHECK (currency = 'DZD'),
  subtotal_dzd bigint CHECK (subtotal_dzd IS NULL OR subtotal_dzd >= 0),
  delivery_fee_dzd bigint CHECK (delivery_fee_dzd IS NULL OR delivery_fee_dzd >= 0),
  total_dzd bigint CHECK (total_dzd IS NULL OR total_dzd >= 0),
  tracking_token_hash bytea NOT NULL UNIQUE
    CONSTRAINT store_orders_tracking_token_hash_check CHECK (octet_length(tracking_token_hash) = 32),
  idempotency_key_hash bytea UNIQUE
    CHECK (idempotency_key_hash IS NULL OR octet_length(idempotency_key_hash) = 32),
  terms_version text NOT NULL,
  terms_accepted_at timestamptz NOT NULL,
  privacy_notice_version text NOT NULL,
  marketing_opt_in boolean NOT NULL DEFAULT false,
  marketing_opt_in_at timestamptz,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  shipped_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_orders_shipping_address_check CHECK (
    delivery_mode <> 'shipping'
    OR (
      nullif(btrim(delivery_address), '') IS NOT NULL
      AND nullif(btrim(delivery_wilaya), '') IS NOT NULL
    )
  ),
  CONSTRAINT store_orders_total_consistency_check CHECK (
    total_dzd IS NULL
    OR (
      subtotal_dzd IS NOT NULL
      AND delivery_fee_dzd IS NOT NULL
      AND total_dzd = subtotal_dzd + delivery_fee_dzd
    )
  ),
  CONSTRAINT store_orders_marketing_opt_in_check CHECK (
    marketing_opt_in = (marketing_opt_in_at IS NOT NULL)
  )
);

CREATE TABLE public.store_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.store_orders(id) ON DELETE RESTRICT,
  product_id uuid REFERENCES public.store_products(id) ON DELETE RESTRICT,
  variant_id uuid REFERENCES public.store_variants(id) ON DELETE RESTRICT,
  product_code text NOT NULL,
  variant_code text,
  title_snapshot text NOT NULL,
  variant_label_snapshot text,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  price_mode text NOT NULL CHECK (price_mode IN ('fixed', 'quote')),
  unit_price_dzd bigint CHECK (unit_price_dzd IS NULL OR unit_price_dzd >= 0),
  line_total_dzd bigint CHECK (line_total_dzd IS NULL OR line_total_dzd >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_order_items_price_consistency_check CHECK (
    (price_mode = 'fixed' AND unit_price_dzd IS NOT NULL AND line_total_dzd IS NOT NULL)
    OR (price_mode = 'quote' AND unit_price_dzd IS NULL AND line_total_dzd IS NULL)
  )
);

CREATE TABLE public.store_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.store_orders(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (btrim(event_type) <> ''),
  from_status text,
  to_status text,
  actor_type text NOT NULL CHECK (actor_type IN ('system', 'edge_function', 'operator', 'customer')),
  actor_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX store_products_publication_order_idx
  ON public.store_products (publication_status, display_order);
CREATE INDEX store_variants_product_availability_idx
  ON public.store_variants (product_id, availability);
CREATE INDEX store_orders_status_submitted_idx
  ON public.store_orders (status, submitted_at DESC);
CREATE INDEX store_orders_phone_submitted_idx
  ON public.store_orders (customer_phone, submitted_at DESC);
CREATE INDEX store_order_items_order_idx
  ON public.store_order_items (order_id);
CREATE INDEX store_order_events_order_created_idx
  ON public.store_order_events (order_id, created_at);

-- All store tables are RLS-protected and deny direct client access.
-- Edge Functions will use a server-only key; never expose it to the storefront.
ALTER TABLE public.store_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_order_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY store_products_deny_clients ON public.store_products
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY store_variants_deny_clients ON public.store_variants
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY store_orders_deny_clients ON public.store_orders
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY store_order_items_deny_clients ON public.store_order_items
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY store_order_events_deny_clients ON public.store_order_events
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON public.store_products, public.store_variants, public.store_orders,
  public.store_order_items, public.store_order_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.store_products, public.store_variants,
  public.store_orders, public.store_order_items TO service_role;
GRANT SELECT, INSERT ON public.store_order_events TO service_role;

-- Seed only catalogue metadata already present in the approved 12-item storefront.
-- No price, stock quantity, pack format, or lead time is invented here.
INSERT INTO public.store_products
  (product_code, slug, family, organism_label, title_i18n, description_i18n, source_notion_url, publication_status, display_order)
VALUES
('BAL-LC-PPU-ETE-001','bal-lc-ppu-ete-001','liquid','PLEUROTUS PULMONARIUS',
 '{"fr":"LC — Pleurotus pulmonarius · été","en":"LC — Pleurotus pulmonarius · summer","ar":"مزرعة سائلة — Pleurotus pulmonarius · الصيف","pt":"LC — Pleurotus pulmonarius · verão"}',
 '{"fr":"Culture liquide de Pleurotus pulmonarius — désignation « été ».","en":"Pleurotus pulmonarius liquid culture — “summer” designation.","ar":"مزرعة سائلة من Pleurotus pulmonarius — تسمية «الصيف».","pt":"Cultura líquida de Pleurotus pulmonarius — designação «verão»."}',
 'https://app.notion.com/p/40173152f1718165a79ace1bc6189c24','published',1),
('BAL-LC-PPU-HIV-001','bal-lc-ppu-hiv-001','liquid','PLEUROTUS PULMONARIUS',
 '{"fr":"LC — Pleurotus pulmonarius · hiver","en":"LC — Pleurotus pulmonarius · winter","ar":"مزرعة سائلة — Pleurotus pulmonarius · الشتاء","pt":"LC — Pleurotus pulmonarius · inverno"}',
 '{"fr":"Culture liquide de Pleurotus pulmonarius — désignation « hiver ».","en":"Pleurotus pulmonarius liquid culture — “winter” designation.","ar":"مزرعة سائلة من Pleurotus pulmonarius — تسمية «الشتاء».","pt":"Cultura líquida de Pleurotus pulmonarius — designação «inverno»."}',
 'https://app.notion.com/p/40173152f17181cab9f3e85af551ebde','published',2),
('BAL-LC-PER-HYB-001','bal-lc-per-hyb-001','liquid','PLEUROTUS ERYNGII',
 '{"fr":"LC — Pleurotus eryngii · hybrides","en":"LC — Pleurotus eryngii · hybrids","ar":"مزرعة سائلة — Pleurotus eryngii · هجائن","pt":"LC — Pleurotus eryngii · híbridos"}',
 '{"fr":"Culture liquide de Pleurotus eryngii — sélection hybride.","en":"Pleurotus eryngii liquid culture — hybrid selection.","ar":"مزرعة سائلة من Pleurotus eryngii — مجموعة هجينة.","pt":"Cultura líquida de Pleurotus eryngii — seleção híbrida."}',
 'https://app.notion.com/p/40173152f1718121bb57fd5eb152e64d','published',3),
('BAL-LC-POS-KRYOS-001','bal-lc-pos-kryos-001','liquid','PLEUROTUS OSTREATUS',
 '{"fr":"LC — Pleurotus ostreatus · KRYOS","en":"LC — Pleurotus ostreatus · KRYOS","ar":"مزرعة سائلة — Pleurotus ostreatus · KRYOS","pt":"LC — Pleurotus ostreatus · KRYOS"}',
 '{"fr":"Culture liquide de Pleurotus ostreatus — KRYOS.","en":"Pleurotus ostreatus liquid culture — KRYOS.","ar":"مزرعة سائلة من Pleurotus ostreatus — KRYOS.","pt":"Cultura líquida de Pleurotus ostreatus — KRYOS."}',
 'https://app.notion.com/p/40173152f171813081afe4ef7766742b','published',4),
('BAL-LC-POS-GRISAM-001','bal-lc-pos-grisam-001','liquid','PLEUROTUS OSTREATUS',
 '{"fr":"LC — Pleurotus ostreatus · Gris américain","en":"LC — Pleurotus ostreatus · American Grey","ar":"مزرعة سائلة — Pleurotus ostreatus · الرمادي الأمريكي","pt":"LC — Pleurotus ostreatus · Cinzento americano"}',
 '{"fr":"Culture liquide de Pleurotus ostreatus — Gris américain.","en":"Pleurotus ostreatus liquid culture — American Grey.","ar":"مزرعة سائلة من Pleurotus ostreatus — Gris américain.","pt":"Cultura líquida de Pleurotus ostreatus — Cinzento americano."}',
 'https://app.notion.com/p/40173152f17181388138ce462dc3596e','published',5),
('BAL-LC-POS-HK35-001','bal-lc-pos-hk35-001','liquid','PLEUROTUS OSTREATUS',
 '{"fr":"LC — Pleurotus ostreatus · HK35","en":"LC — Pleurotus ostreatus · HK35","ar":"مزرعة سائلة — Pleurotus ostreatus · HK35","pt":"LC — Pleurotus ostreatus · HK35"}',
 '{"fr":"Culture liquide de Pleurotus ostreatus — HK35.","en":"Pleurotus ostreatus liquid culture — HK35.","ar":"مزرعة سائلة من Pleurotus ostreatus — HK35.","pt":"Cultura líquida de Pleurotus ostreatus — HK35."}',
 'https://app.notion.com/p/40173152f1718150a36eddc52198e963','published',6),
('BAL-LC-PPU-001','bal-lc-ppu-001','liquid','PLEUROTUS PULMONARIUS',
 '{"fr":"LC — Pleurotus pulmonarius","en":"LC — Pleurotus pulmonarius","ar":"مزرعة سائلة — Pleurotus pulmonarius","pt":"LC — Pleurotus pulmonarius"}',
 '{"fr":"Culture liquide de Pleurotus pulmonarius.","en":"Pleurotus pulmonarius liquid culture.","ar":"مزرعة سائلة من Pleurotus pulmonarius.","pt":"Cultura líquida de Pleurotus pulmonarius."}',
 'https://app.notion.com/p/40173152f17181ab8b0bd41a5832e355','published',7),
('BAL-LC-PCO-001','bal-lc-pco-001','liquid','PLEUROTUS COLUMBINUS',
 '{"fr":"LC — Pleurotus columbinus","en":"LC — Pleurotus columbinus","ar":"مزرعة سائلة — Pleurotus columbinus","pt":"LC — Pleurotus columbinus"}',
 '{"fr":"Culture liquide de Pleurotus columbinus.","en":"Pleurotus columbinus liquid culture.","ar":"مزرعة سائلة من Pleurotus columbinus.","pt":"Cultura líquida de Pleurotus columbinus."}',
 'https://app.notion.com/p/40173152f17181c393c6c26aa5b9191b','published',8),
('BAL-LC-POS-P80-001','bal-lc-pos-p80-001','liquid','PLEUROTUS OSTREATUS',
 '{"fr":"LC — Pleurotus ostreatus · P80","en":"LC — Pleurotus ostreatus · P80","ar":"مزرعة سائلة — Pleurotus ostreatus · P80","pt":"LC — Pleurotus ostreatus · P80"}',
 '{"fr":"Culture liquide de Pleurotus ostreatus — P80.","en":"Pleurotus ostreatus liquid culture — P80.","ar":"مزرعة سائلة من Pleurotus ostreatus — P80.","pt":"Cultura líquida de Pleurotus ostreatus — P80."}',
 'https://app.notion.com/p/40173152f17181e7acbcd20c85566bc6','published',9),
('BAL-LC-POS-G8-001','bal-lc-pos-g8-001','liquid','PLEUROTUS OSTREATUS',
 '{"fr":"LC — Pleurotus ostreatus · G8","en":"LC — Pleurotus ostreatus · G8","ar":"مزرعة سائلة — Pleurotus ostreatus · G8","pt":"Cultura líquida de Pleurotus ostreatus — G8"}',
 '{"fr":"Culture liquide de Pleurotus ostreatus — G8.","en":"Pleurotus ostreatus liquid culture — G8.","ar":"مزرعة سائلة من Pleurotus ostreatus — G8.","pt":"Cultura líquida de Pleurotus ostreatus — G8."}',
 'https://app.notion.com/p/40173152f17181f4888dc89c8c43ee76','published',10),
('BAL-LC-POS-BLUE-001','bal-lc-pos-blue-001','liquid','PLEUROTUS OSTREATUS',
 '{"fr":"LC — Pleurotus ostreatus · Blue Oyster","en":"LC — Pleurotus ostreatus · Blue Oyster","ar":"مزرعة سائلة — Pleurotus ostreatus · Blue Oyster","pt":"LC — Pleurotus ostreatus · Blue Oyster"}',
 '{"fr":"Culture liquide de Pleurotus ostreatus — Blue Oyster.","en":"Pleurotus ostreatus liquid culture — Blue Oyster.","ar":"مزرعة سائلة من Pleurotus ostreatus — Blue Oyster.","pt":"Cultura líquida de Pleurotus ostreatus — Blue Oyster."}',
 'https://app.notion.com/p/40173152f17181fc877cd198e7911eac','published',11),
('BAL-CUL-AGAR-001','bal-cul-agar-001','agar','MILIEU DE CULTURE / CULTURE MEDIUM',
 '{"fr":"WA — Gélose à l’eau prête à l’emploi","en":"WA — Ready-to-use water agar","ar":"آغار مائي جاهز للاستعمال","pt":"WA — Ágar-água pronto a usar"}',
 '{"fr":"Boîtes de Petri prêtes à l’emploi ; format et conditionnement à confirmer.","en":"Ready-to-use Petri dishes; format and packaging to be confirmed.","ar":"أطباق بتري جاهزة للاستعمال؛ يتم تأكيد الحجم والتغليف.","pt":"Placas de Petri prontas a utilizar; formato e embalagem a confirmar."}',
 'https://app.notion.com/p/3f473152f171812a814dd7b951786313','published',12);

COMMENT ON TABLE public.store_products IS 'Public-facing BA Labs product catalogue source; writes and reads are backend-only until a safe public catalogue endpoint is deployed.';
COMMENT ON TABLE public.store_variants IS 'Commercial pack variants; prices and stock remain null until BA Labs confirms them.';
COMMENT ON TABLE public.store_orders IS 'Guest checkout requests and orders; personal data is backend-only and never exposed directly through the Data API.';
COMMENT ON TABLE public.store_order_items IS 'Immutable product, variant, and price snapshots captured when a guest order is submitted.';
COMMENT ON TABLE public.store_order_events IS 'Append-only audit trail for commerce order state transitions; event details must not contain unnecessary personal data.';
