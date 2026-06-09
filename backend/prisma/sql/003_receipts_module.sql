-- Migration manual: módulo Receipts (Comprobantes).
-- Idempotente.

DO $$ BEGIN
  CREATE TYPE receipt_type AS ENUM ('ticket','boleta','factura','nota_credito','nota_debito');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE receipt_status AS ENUM ('draft','issued','voided','rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS receipts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id          uuid NOT NULL REFERENCES locations(id),
  sale_id              uuid REFERENCES sales(id),
  type                 receipt_type NOT NULL,
  series               varchar(10) NOT NULL,
  number               integer NOT NULL,
  status               receipt_status NOT NULL DEFAULT 'draft',
  customer_doc_type    varchar(20),
  customer_doc_number  varchar(30),
  customer_name        varchar(255),
  customer_address     text,
  subtotal             numeric(15,4) NOT NULL,
  tax_amount           numeric(15,4) NOT NULL,
  total                numeric(15,4) NOT NULL,
  currency_code        char(3) NOT NULL,
  payload_json         jsonb,
  file_url             text,
  issued_at            timestamptz,
  voided_at            timestamptz,
  void_reason          text,
  external_code        varchar(255),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS receipts_tenant_location_type_series_number_key
  ON receipts(tenant_id, location_id, type, series, number);
CREATE INDEX IF NOT EXISTS receipts_tenant_status_created_idx
  ON receipts(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS receipts_sale_idx ON receipts(sale_id);
