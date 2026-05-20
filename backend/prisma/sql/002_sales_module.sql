-- Migration manual: módulo Sales (Sale + SaleItem + Payment + enums).
-- Idempotente: usa IF NOT EXISTS donde sea posible.

DO $$ BEGIN
  CREATE TYPE sale_status AS ENUM ('draft', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('cash', 'card_debit', 'card_credit', 'yape', 'plin', 'bank_transfer', 'credit', 'other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS sales (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id      uuid NOT NULL REFERENCES locations(id),
  cashier_id       uuid NOT NULL REFERENCES users(id),
  customer_id      uuid REFERENCES contacts(id),
  sale_number      integer NOT NULL,
  status           sale_status NOT NULL DEFAULT 'draft',
  subtotal         numeric(15, 4) NOT NULL,
  tax_amount       numeric(15, 4) NOT NULL,
  discount_amount  numeric(15, 4) DEFAULT 0,
  total            numeric(15, 4) NOT NULL,
  currency_code    char(3) NOT NULL,
  notes            text,
  completed_at     timestamptz,
  cancelled_at     timestamptz,
  cancel_reason    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sales_tenant_location_number_key
  ON sales(tenant_id, location_id, sale_number);
CREATE INDEX IF NOT EXISTS sales_tenant_location_created_idx
  ON sales(tenant_id, location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sales_tenant_cashier_created_idx
  ON sales(tenant_id, cashier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sales_tenant_status_idx
  ON sales(tenant_id, status);

CREATE TABLE IF NOT EXISTS sale_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id          uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  tenant_id        uuid NOT NULL REFERENCES tenants(id),
  variant_id       uuid NOT NULL REFERENCES product_variants(id),
  quantity         numeric(12, 4) NOT NULL,
  unit_price       numeric(15, 4) NOT NULL,
  tax_rate         numeric(5, 2) NOT NULL,
  tax_amount       numeric(15, 4) NOT NULL,
  discount_amount  numeric(15, 4) DEFAULT 0,
  line_total       numeric(15, 4) NOT NULL,
  product_name     varchar(255) NOT NULL,
  product_sku      varchar(50),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sale_items_sale_idx ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS sale_items_tenant_variant_created_idx
  ON sale_items(tenant_id, variant_id, created_at);

CREATE TABLE IF NOT EXISTS payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id          uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  tenant_id        uuid NOT NULL REFERENCES tenants(id),
  method           payment_method NOT NULL,
  amount           numeric(15, 4) NOT NULL,
  reference        varchar(255),
  received_amount  numeric(15, 4),
  change_amount    numeric(15, 4),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_sale_idx ON payments(sale_id);

-- Trigger auto-update updated_at
CREATE OR REPLACE FUNCTION sales_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sales_updated_at ON sales;
CREATE TRIGGER sales_updated_at BEFORE UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION sales_set_updated_at();
