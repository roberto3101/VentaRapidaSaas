--
-- PostgreSQL database dump
--

\restrict FG8ytzogcQeSYE4YIanVH67wp8XJjR6JrI1duUJYdS4pAN1wiJsWF5qOT3ei6ua

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: audit_action; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.audit_action AS ENUM (
    'CREATE',
    'UPDATE',
    'DELETE',
    'RESTORE',
    'LOGIN',
    'LOGOUT',
    'STOCK_ADJUSTMENT',
    'TRANSFER_CREATE',
    'TRANSFER_COMPLETE',
    'TRANSFER_CANCEL'
);


--
-- Name: contact_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.contact_type AS ENUM (
    'supplier',
    'customer',
    'both'
);


--
-- Name: document_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.document_type AS ENUM (
    'DNI',
    'RUC',
    'CE',
    'CI',
    'RIF',
    'PASSPORT',
    'OTHER'
);


--
-- Name: movement_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.movement_type AS ENUM (
    'purchase',
    'sale',
    'transfer_in',
    'transfer_out',
    'adjustment_in',
    'adjustment_out',
    'initial',
    'return_in',
    'return_out'
);


--
-- Name: price_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.price_type AS ENUM (
    'sale',
    'purchase'
);


--
-- Name: transfer_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transfer_status AS ENUM (
    'pending',
    'in_transit',
    'completed',
    'cancelled'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'super_admin',
    'tenant_admin',
    'location_manager',
    'operator'
);


--
-- Name: current_tenant_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_tenant_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID;
$$;


--
-- Name: fn_cleanup_old_audit_logs(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_cleanup_old_audit_logs(months_to_keep integer DEFAULT 12) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
  deleted BIGINT;
BEGIN
  DELETE FROM audit_logs
  WHERE created_at < NOW() - (months_to_keep || ' months')::INTERVAL;
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;


--
-- Name: fn_get_effective_price(uuid, uuid, public.price_type); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_get_effective_price(p_variant_id uuid, p_location_id uuid, p_price_type public.price_type DEFAULT 'sale'::public.price_type) RETURNS numeric
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  v_price DECIMAL(14,2);
  v_promo DECIMAL(14,2);
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- 1. Buscar precio con promo activa en la ubicación
  SELECT lp.price, lp.promo_price
  INTO v_price, v_promo
  FROM location_prices lp
  WHERE lp.variant_id = p_variant_id
    AND lp.location_id = p_location_id
    AND lp.price_type = p_price_type;

  -- ¿Tiene promo activa?
  IF v_promo IS NOT NULL THEN
    DECLARE
      v_starts TIMESTAMPTZ;
      v_ends TIMESTAMPTZ;
    BEGIN
      SELECT promo_starts_at, promo_ends_at INTO v_starts, v_ends
      FROM location_prices
      WHERE variant_id = p_variant_id
        AND location_id = p_location_id
        AND price_type = p_price_type;

      IF (v_starts IS NULL OR v_starts <= v_now)
         AND (v_ends IS NULL OR v_ends >= v_now) THEN
        RETURN v_promo;
      END IF;
    END;
  END IF;

  -- 2. Si hay precio de ubicación, retornarlo
  IF v_price IS NOT NULL THEN
    RETURN v_price;
  END IF;

  -- 3. Fallback: precio base del variant
  IF p_price_type = 'sale' THEN
    SELECT sale_price INTO v_price FROM product_variants WHERE id = p_variant_id;
  ELSE
    SELECT purchase_price INTO v_price FROM product_variants WHERE id = p_variant_id;
  END IF;

  RETURN COALESCE(v_price, 0);
END;
$$;


--
-- Name: fn_get_effective_tax_rate(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_get_effective_tax_rate(p_tenant_id uuid, p_location_id uuid) RETURNS numeric
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  v_rate DECIMAL(5,2);
BEGIN
  -- 1. Location override
  SELECT tax_rate INTO v_rate
  FROM locations
  WHERE id = p_location_id AND tax_rate IS NOT NULL;

  IF v_rate IS NOT NULL THEN
    RETURN v_rate;
  END IF;

  -- 2. Tenant default
  SELECT tax_rate INTO v_rate FROM tenants WHERE id = p_tenant_id;

  RETURN COALESCE(v_rate, 0);
END;
$$;


--
-- Name: fn_next_sequence(uuid, character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_next_sequence(p_tenant_id uuid, p_type character varying, p_prefix character varying DEFAULT 'TRF'::character varying) RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_year SMALLINT := EXTRACT(YEAR FROM NOW());
  v_next BIGINT;
BEGIN
  INSERT INTO tenant_sequences (tenant_id, sequence_type, prefix, current_value, year)
  VALUES (p_tenant_id, p_type, p_prefix, 1, v_year)
  ON CONFLICT (tenant_id, sequence_type, year)
  DO UPDATE SET current_value = tenant_sequences.current_value + 1
  RETURNING current_value INTO v_next;

  RETURN p_prefix || '-' || v_year || '-' || LPAD(v_next::TEXT, 6, '0');
END;
$$;


--
-- Name: fn_recalculate_all_stock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_recalculate_all_stock() RETURNS TABLE(variants_updated bigint)
    LANGUAGE plpgsql
    AS $$
BEGIN
  TRUNCATE inventory_stock;

  INSERT INTO inventory_stock (variant_id, location_id, quantity, reserved_quantity, last_movement_at, last_updated)
  SELECT
    variant_id,
    location_id,
    SUM(quantity * direction),
    0,
    MAX(created_at),
    NOW()
  FROM inventory_movements
  GROUP BY variant_id, location_id;

  RETURN QUERY SELECT COUNT(*)::BIGINT FROM inventory_stock;
END;
$$;


--
-- Name: fn_update_stock_on_movement(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_update_stock_on_movement() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO inventory_stock (variant_id, location_id, quantity, reserved_quantity, last_movement_at, last_updated)
  VALUES (
    NEW.variant_id,
    NEW.location_id,
    NEW.quantity * NEW.direction,
    0,
    NEW.created_at,
    NOW()
  )
  ON CONFLICT (variant_id, location_id)
  DO UPDATE SET
    quantity = inventory_stock.quantity + (NEW.quantity * NEW.direction),
    last_movement_at = NEW.created_at,
    last_updated = NOW();

  RETURN NEW;
END;
$$;


--
-- Name: fn_update_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_update_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: fn_verify_stock_integrity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_verify_stock_integrity() RETURNS TABLE(variant_id uuid, location_id uuid, cached_quantity integer, calculated_quantity bigint, difference bigint)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.variant_id,
    s.location_id,
    s.quantity AS cached_quantity,
    COALESCE(SUM(m.quantity * m.direction), 0)::BIGINT AS calculated_quantity,
    (COALESCE(SUM(m.quantity * m.direction), 0) - s.quantity)::BIGINT AS difference
  FROM inventory_stock s
  LEFT JOIN inventory_movements m
    ON m.variant_id = s.variant_id AND m.location_id = s.location_id
  GROUP BY s.variant_id, s.location_id, s.quantity
  HAVING s.quantity != COALESCE(SUM(m.quantity * m.direction), 0);
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: attribute_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attribute_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    user_id uuid,
    action public.audit_action NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id uuid,
    old_values jsonb,
    new_values jsonb,
    ip_address inet,
    user_agent text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    parent_id uuid,
    slug character varying(255),
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    type public.contact_type DEFAULT 'supplier'::public.contact_type NOT NULL,
    name character varying(255) NOT NULL,
    company_name character varying(255),
    document_type public.document_type,
    document_number character varying(50),
    email character varying(255),
    phone character varying(50),
    address text,
    city character varying(100),
    notes text,
    credit_limit numeric(14,2),
    payment_terms_days integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: inventory_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    location_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    movement_type public.movement_type NOT NULL,
    quantity integer NOT NULL,
    direction smallint NOT NULL,
    transfer_id uuid,
    contact_id uuid,
    reference_code character varying(100),
    unit_cost numeric(14,2),
    unit_price numeric(14,2),
    tax_rate numeric(5,2),
    tax_amount numeric(14,2),
    subtotal numeric(14,2),
    total numeric(14,2),
    currency_code character(3),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid NOT NULL,
    is_reversal boolean DEFAULT false,
    reversal_of uuid,
    CONSTRAINT chk_direction_valid CHECK ((direction = ANY (ARRAY[1, '-1'::integer]))),
    CONSTRAINT chk_quantity_positive CHECK ((quantity > 0))
);


--
-- Name: inventory_stock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_stock (
    variant_id uuid NOT NULL,
    location_id uuid NOT NULL,
    quantity integer DEFAULT 0 NOT NULL,
    reserved_quantity integer DEFAULT 0 NOT NULL,
    available_quantity integer GENERATED ALWAYS AS ((quantity - reserved_quantity)) STORED,
    last_movement_at timestamp with time zone,
    last_updated timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: location_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_prices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    variant_id uuid NOT NULL,
    location_id uuid NOT NULL,
    price_type public.price_type NOT NULL,
    price numeric(14,2) NOT NULL,
    promo_price numeric(14,2),
    promo_starts_at timestamp with time zone,
    promo_ends_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    code character varying(20),
    address text,
    city character varying(100),
    state_province character varying(100),
    country_code character(2),
    phone character varying(50),
    email character varying(255),
    tax_name character varying(20),
    tax_rate numeric(5,2),
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: product_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    sku character varying(100) NOT NULL,
    barcode character varying(255),
    variant_name character varying(255),
    purchase_price numeric(14,2) DEFAULT 0,
    sale_price numeric(14,2) DEFAULT 0,
    min_stock integer DEFAULT 0,
    max_stock integer,
    weight numeric(10,3),
    weight_unit character varying(5) DEFAULT 'kg'::character varying,
    unit character varying(20) DEFAULT 'und'::character varying,
    units_per_box integer,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    category_id uuid,
    name character varying(255) NOT NULL,
    description text,
    brand character varying(255),
    image_url text,
    has_variants boolean DEFAULT false,
    tags text[],
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_at timestamp with time zone
);


--
-- Name: tenant_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_sequences (
    tenant_id uuid NOT NULL,
    sequence_type character varying(20) NOT NULL,
    prefix character varying(10) DEFAULT 'TRF'::character varying NOT NULL,
    current_value bigint DEFAULT 0 NOT NULL,
    year smallint DEFAULT EXTRACT(year FROM now()) NOT NULL
);


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(100) NOT NULL,
    logo_url text,
    country_code character(2) DEFAULT 'PE'::bpchar NOT NULL,
    currency_code character(3) DEFAULT 'PEN'::bpchar NOT NULL,
    currency_symbol character varying(5) DEFAULT 'S/'::character varying NOT NULL,
    timezone character varying(50) DEFAULT 'America/Lima'::character varying NOT NULL,
    locale character varying(10) DEFAULT 'es-PE'::character varying,
    date_format character varying(20) DEFAULT 'DD/MM/YYYY'::character varying,
    tax_name character varying(20) DEFAULT 'IGV'::character varying,
    tax_rate numeric(5,2) DEFAULT 18.00,
    tax_included boolean DEFAULT true,
    low_stock_threshold integer DEFAULT 10,
    allow_negative_stock boolean DEFAULT false,
    require_reference_on_sale boolean DEFAULT false,
    require_reference_on_purchase boolean DEFAULT false,
    plan character varying(50) DEFAULT 'free'::character varying,
    max_locations integer DEFAULT 3,
    max_users integer DEFAULT 10,
    max_products integer DEFAULT 1000,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transfers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    transfer_number character varying(50) NOT NULL,
    from_location_id uuid NOT NULL,
    to_location_id uuid NOT NULL,
    status public.transfer_status DEFAULT 'pending'::public.transfer_status NOT NULL,
    notes text,
    expected_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid NOT NULL,
    completed_at timestamp with time zone,
    completed_by uuid,
    cancelled_at timestamp with time zone,
    cancelled_by uuid,
    cancel_reason text,
    CONSTRAINT chk_different_locations CHECK ((from_location_id <> to_location_id))
);


--
-- Name: user_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_locations (
    user_id uuid NOT NULL,
    location_id uuid NOT NULL,
    is_default boolean DEFAULT false,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_by uuid
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    full_name character varying(255) NOT NULL,
    phone character varying(50),
    role public.user_role DEFAULT 'operator'::public.user_role NOT NULL,
    avatar_url text,
    preferred_location_id uuid,
    refresh_token_hash character varying(255),
    last_login_at timestamp with time zone,
    last_login_ip inet,
    failed_attempts smallint DEFAULT 0,
    locked_until timestamp with time zone,
    password_changed_at timestamp with time zone DEFAULT now(),
    must_change_password boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: v_location_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_location_summary AS
 SELECT l.id AS location_id,
    l.tenant_id,
    l.name AS location_name,
    l.code AS location_code,
    count(DISTINCT s.variant_id) AS total_products,
    sum(s.quantity) AS total_units,
    sum(
        CASE
            WHEN ((s.quantity <= COALESCE(pv.min_stock, 0)) AND (s.quantity > 0)) THEN 1
            ELSE 0
        END) AS low_stock_count,
    sum(
        CASE
            WHEN (s.quantity <= 0) THEN 1
            ELSE 0
        END) AS out_of_stock_count,
    ( SELECT count(*) AS count
           FROM public.inventory_movements m
          WHERE ((m.location_id = l.id) AND (m.created_at >= (now() - '24:00:00'::interval)))) AS movements_last_24h
   FROM ((public.locations l
     LEFT JOIN public.inventory_stock s ON ((s.location_id = l.id)))
     LEFT JOIN public.product_variants pv ON (((pv.id = s.variant_id) AND (pv.deleted_at IS NULL))))
  WHERE (l.deleted_at IS NULL)
  GROUP BY l.id, l.tenant_id, l.name, l.code;


--
-- Name: v_recent_movements; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_recent_movements AS
 SELECT m.id,
    m.tenant_id,
    m.location_id,
    l.name AS location_name,
    m.variant_id,
    p.name AS product_name,
    pv.sku,
    pv.variant_name,
    m.movement_type,
    m.quantity,
    m.direction,
    (m.quantity * m.direction) AS net_quantity,
    m.unit_cost,
    m.unit_price,
    m.tax_rate,
    m.tax_amount,
    m.subtotal,
    m.total,
    m.currency_code,
    m.reference_code,
    m.notes,
    m.is_reversal,
    m.reversal_of,
    m.contact_id,
    co.name AS contact_name,
    m.transfer_id,
    m.created_at,
    m.created_by,
    u.full_name AS created_by_name
   FROM (((((public.inventory_movements m
     JOIN public.product_variants pv ON ((pv.id = m.variant_id)))
     JOIN public.products p ON ((p.id = pv.product_id)))
     JOIN public.locations l ON ((l.id = m.location_id)))
     JOIN public.users u ON ((u.id = m.created_by)))
     LEFT JOIN public.contacts co ON ((co.id = m.contact_id)));


--
-- Name: v_stock_detail; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_stock_detail AS
 SELECT s.variant_id,
    s.location_id,
    s.quantity,
    s.reserved_quantity,
    s.available_quantity,
    s.last_movement_at,
    pv.sku,
    pv.barcode,
    pv.variant_name,
    pv.unit,
    pv.min_stock,
    pv.max_stock,
    public.fn_get_effective_price(pv.id, s.location_id, 'sale'::public.price_type) AS effective_sale_price,
    public.fn_get_effective_price(pv.id, s.location_id, 'purchase'::public.price_type) AS effective_purchase_price,
    pv.sale_price AS base_sale_price,
    pv.purchase_price AS base_purchase_price,
    p.id AS product_id,
    p.tenant_id,
    p.name AS product_name,
    p.brand,
    p.has_variants,
    p.category_id,
    c.name AS category_name,
    l.name AS location_name,
    l.code AS location_code,
        CASE
            WHEN (s.quantity <= COALESCE(pv.min_stock, 0)) THEN true
            ELSE false
        END AS is_low_stock,
        CASE
            WHEN ((pv.max_stock IS NOT NULL) AND (s.quantity >= pv.max_stock)) THEN true
            ELSE false
        END AS is_overstock,
        CASE
            WHEN (s.quantity <= 0) THEN true
            ELSE false
        END AS is_out_of_stock
   FROM ((((public.inventory_stock s
     JOIN public.product_variants pv ON (((pv.id = s.variant_id) AND (pv.deleted_at IS NULL))))
     JOIN public.products p ON (((p.id = pv.product_id) AND (p.deleted_at IS NULL))))
     JOIN public.locations l ON (((l.id = s.location_id) AND (l.deleted_at IS NULL))))
     LEFT JOIN public.categories c ON (((c.id = p.category_id) AND (c.deleted_at IS NULL))));


--
-- Name: v_stock_total; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_stock_total AS
 SELECT pv.id AS variant_id,
    p.tenant_id,
    p.name AS product_name,
    pv.sku,
    pv.variant_name,
    sum(COALESCE(s.quantity, 0)) AS total_quantity,
    sum(COALESCE(s.available_quantity, 0)) AS total_available,
    count(DISTINCT s.location_id) AS locations_count,
    bool_or((COALESCE(s.quantity, 0) <= COALESCE(pv.min_stock, 0))) AS has_low_stock_somewhere,
    bool_or((COALESCE(s.quantity, 0) <= 0)) AS has_out_of_stock_somewhere
   FROM ((public.product_variants pv
     JOIN public.products p ON (((p.id = pv.product_id) AND (p.deleted_at IS NULL))))
     LEFT JOIN public.inventory_stock s ON ((s.variant_id = pv.id)))
  WHERE (pv.deleted_at IS NULL)
  GROUP BY pv.id, p.tenant_id, p.name, pv.sku, pv.variant_name;


--
-- Name: variant_attribute_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.variant_attribute_values (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    variant_id uuid NOT NULL,
    attribute_type_id uuid NOT NULL,
    value character varying(255) NOT NULL
);


--
-- Name: attribute_types attribute_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attribute_types
    ADD CONSTRAINT attribute_types_pkey PRIMARY KEY (id);


--
-- Name: attribute_types attribute_types_tenant_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attribute_types
    ADD CONSTRAINT attribute_types_tenant_id_name_key UNIQUE (tenant_id, name);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: categories categories_tenant_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_tenant_id_slug_key UNIQUE (tenant_id, slug);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: inventory_movements inventory_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_pkey PRIMARY KEY (id);


--
-- Name: inventory_stock inventory_stock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_stock
    ADD CONSTRAINT inventory_stock_pkey PRIMARY KEY (variant_id, location_id);


--
-- Name: location_prices location_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_prices
    ADD CONSTRAINT location_prices_pkey PRIMARY KEY (id);


--
-- Name: location_prices location_prices_variant_id_location_id_price_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_prices
    ADD CONSTRAINT location_prices_variant_id_location_id_price_type_key UNIQUE (variant_id, location_id, price_type);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: locations locations_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: product_variants product_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: tenant_sequences tenant_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_sequences
    ADD CONSTRAINT tenant_sequences_pkey PRIMARY KEY (tenant_id, sequence_type, year);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_slug_key UNIQUE (slug);


--
-- Name: transfers transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfers
    ADD CONSTRAINT transfers_pkey PRIMARY KEY (id);


--
-- Name: user_locations user_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_locations
    ADD CONSTRAINT user_locations_pkey PRIMARY KEY (user_id, location_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: variant_attribute_values variant_attribute_values_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variant_attribute_values
    ADD CONSTRAINT variant_attribute_values_pkey PRIMARY KEY (id);


--
-- Name: variant_attribute_values variant_attribute_values_variant_id_attribute_type_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variant_attribute_values
    ADD CONSTRAINT variant_attribute_values_variant_id_attribute_type_id_key UNIQUE (variant_id, attribute_type_id);


--
-- Name: idx_audit_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_entity ON public.audit_logs USING btree (entity_type, entity_id);


--
-- Name: idx_audit_tenant_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_tenant_date ON public.audit_logs USING btree (tenant_id, created_at DESC);


--
-- Name: idx_audit_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_user ON public.audit_logs USING btree (user_id, created_at DESC);


--
-- Name: idx_categories_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_parent ON public.categories USING btree (parent_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_categories_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_tenant ON public.categories USING btree (tenant_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_contacts_document_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_contacts_document_unique ON public.contacts USING btree (tenant_id, document_type, document_number) WHERE ((deleted_at IS NULL) AND (document_number IS NOT NULL));


--
-- Name: idx_contacts_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_tenant ON public.contacts USING btree (tenant_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_contacts_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_type ON public.contacts USING btree (tenant_id, type) WHERE (deleted_at IS NULL);


--
-- Name: idx_location_prices_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_location_prices_location ON public.location_prices USING btree (location_id);


--
-- Name: idx_location_prices_promo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_location_prices_promo ON public.location_prices USING btree (variant_id, location_id, promo_starts_at, promo_ends_at) WHERE (promo_price IS NOT NULL);


--
-- Name: idx_location_prices_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_location_prices_variant ON public.location_prices USING btree (variant_id);


--
-- Name: idx_locations_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_tenant ON public.locations USING btree (tenant_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_movements_financial; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movements_financial ON public.inventory_movements USING btree (tenant_id, created_at, movement_type) INCLUDE (subtotal, tax_amount, total, currency_code);


--
-- Name: idx_movements_location_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movements_location_date ON public.inventory_movements USING btree (location_id, created_at DESC);


--
-- Name: idx_movements_reversal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movements_reversal ON public.inventory_movements USING btree (reversal_of) WHERE (reversal_of IS NOT NULL);


--
-- Name: idx_movements_stock_calc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movements_stock_calc ON public.inventory_movements USING btree (variant_id, location_id, direction);


--
-- Name: idx_movements_tenant_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movements_tenant_date ON public.inventory_movements USING btree (tenant_id, created_at DESC);


--
-- Name: idx_movements_transfer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movements_transfer ON public.inventory_movements USING btree (transfer_id) WHERE (transfer_id IS NOT NULL);


--
-- Name: idx_movements_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movements_type ON public.inventory_movements USING btree (tenant_id, movement_type, created_at DESC);


--
-- Name: idx_movements_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movements_variant ON public.inventory_movements USING btree (variant_id, created_at DESC);


--
-- Name: idx_products_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_active ON public.products USING btree (tenant_id, is_active) WHERE (deleted_at IS NULL);


--
-- Name: idx_products_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_category ON public.products USING btree (category_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_products_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_name_trgm ON public.products USING gin (name public.gin_trgm_ops) WHERE (deleted_at IS NULL);


--
-- Name: idx_products_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_tags ON public.products USING gin (tags) WHERE (deleted_at IS NULL);


--
-- Name: idx_products_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_tenant ON public.products USING btree (tenant_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_stock_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_location ON public.inventory_stock USING btree (location_id);


--
-- Name: idx_stock_low; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_low ON public.inventory_stock USING btree (location_id, quantity) WHERE (quantity > 0);


--
-- Name: idx_stock_zero; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_zero ON public.inventory_stock USING btree (location_id) WHERE (quantity <= 0);


--
-- Name: idx_tenants_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenants_active ON public.tenants USING btree (is_active) WHERE (deleted_at IS NULL);


--
-- Name: idx_tenants_country; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenants_country ON public.tenants USING btree (country_code) WHERE (deleted_at IS NULL);


--
-- Name: idx_tenants_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenants_slug ON public.tenants USING btree (slug) WHERE (deleted_at IS NULL);


--
-- Name: idx_transfers_number; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_transfers_number ON public.transfers USING btree (tenant_id, transfer_number);


--
-- Name: idx_transfers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transfers_status ON public.transfers USING btree (tenant_id, status);


--
-- Name: idx_transfers_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transfers_tenant ON public.transfers USING btree (tenant_id);


--
-- Name: idx_user_locations_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_locations_location ON public.user_locations USING btree (location_id);


--
-- Name: idx_users_email_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_users_email_tenant ON public.users USING btree (email, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE (deleted_at IS NULL);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (tenant_id, role) WHERE (deleted_at IS NULL);


--
-- Name: idx_users_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_tenant ON public.users USING btree (tenant_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_variants_barcode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_barcode ON public.product_variants USING btree (barcode) WHERE (deleted_at IS NULL);


--
-- Name: idx_variants_barcode_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_barcode_lookup ON public.product_variants USING btree (barcode) WHERE ((deleted_at IS NULL) AND (barcode IS NOT NULL));


--
-- Name: idx_variants_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variants_product ON public.product_variants USING btree (product_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_variants_sku_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_variants_sku_unique ON public.product_variants USING btree (sku, product_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_vav_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vav_variant ON public.variant_attribute_values USING btree (variant_id);


--
-- Name: categories trg_categories_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();


--
-- Name: contacts trg_contacts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();


--
-- Name: location_prices trg_location_prices_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_location_prices_updated_at BEFORE UPDATE ON public.location_prices FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();


--
-- Name: locations trg_locations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_locations_updated_at BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();


--
-- Name: inventory_movements trg_movement_update_stock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_movement_update_stock AFTER INSERT ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.fn_update_stock_on_movement();


--
-- Name: product_variants trg_product_variants_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_product_variants_updated_at BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();


--
-- Name: products trg_products_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();


--
-- Name: tenants trg_tenants_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();


--
-- Name: users trg_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();


--
-- Name: attribute_types attribute_types_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attribute_types
    ADD CONSTRAINT attribute_types_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: categories categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: categories categories_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: contacts contacts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: inventory_movements inventory_movements_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id);


--
-- Name: inventory_movements inventory_movements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: inventory_movements inventory_movements_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id);


--
-- Name: inventory_movements inventory_movements_reversal_of_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_reversal_of_fkey FOREIGN KEY (reversal_of) REFERENCES public.inventory_movements(id);


--
-- Name: inventory_movements inventory_movements_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: inventory_movements inventory_movements_transfer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_transfer_id_fkey FOREIGN KEY (transfer_id) REFERENCES public.transfers(id);


--
-- Name: inventory_movements inventory_movements_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);


--
-- Name: inventory_stock inventory_stock_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_stock
    ADD CONSTRAINT inventory_stock_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id);


--
-- Name: inventory_stock inventory_stock_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_stock
    ADD CONSTRAINT inventory_stock_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);


--
-- Name: location_prices location_prices_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_prices
    ADD CONSTRAINT location_prices_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: location_prices location_prices_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_prices
    ADD CONSTRAINT location_prices_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: location_prices location_prices_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_prices
    ADD CONSTRAINT location_prices_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;


--
-- Name: locations locations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: product_variants product_variants_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: products products_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: products products_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: products products_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: tenant_sequences tenant_sequences_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_sequences
    ADD CONSTRAINT tenant_sequences_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: transfers transfers_cancelled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfers
    ADD CONSTRAINT transfers_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public.users(id);


--
-- Name: transfers transfers_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfers
    ADD CONSTRAINT transfers_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.users(id);


--
-- Name: transfers transfers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfers
    ADD CONSTRAINT transfers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: transfers transfers_from_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfers
    ADD CONSTRAINT transfers_from_location_id_fkey FOREIGN KEY (from_location_id) REFERENCES public.locations(id);


--
-- Name: transfers transfers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfers
    ADD CONSTRAINT transfers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: transfers transfers_to_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfers
    ADD CONSTRAINT transfers_to_location_id_fkey FOREIGN KEY (to_location_id) REFERENCES public.locations(id);


--
-- Name: user_locations user_locations_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_locations
    ADD CONSTRAINT user_locations_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id);


--
-- Name: user_locations user_locations_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_locations
    ADD CONSTRAINT user_locations_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: user_locations user_locations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_locations
    ADD CONSTRAINT user_locations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: variant_attribute_values variant_attribute_values_attribute_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variant_attribute_values
    ADD CONSTRAINT variant_attribute_values_attribute_type_id_fkey FOREIGN KEY (attribute_type_id) REFERENCES public.attribute_types(id) ON DELETE CASCADE;


--
-- Name: variant_attribute_values variant_attribute_values_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variant_attribute_values
    ADD CONSTRAINT variant_attribute_values_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: location_prices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.location_prices ENABLE ROW LEVEL SECURITY;

--
-- Name: locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

--
-- Name: attribute_types policy_attribute_types_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY policy_attribute_types_tenant ON public.attribute_types USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: audit_logs policy_audit_logs_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY policy_audit_logs_tenant ON public.audit_logs USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: categories policy_categories_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY policy_categories_tenant ON public.categories USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: contacts policy_contacts_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY policy_contacts_tenant ON public.contacts USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: inventory_movements policy_inventory_movements_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY policy_inventory_movements_tenant ON public.inventory_movements USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: location_prices policy_location_prices_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY policy_location_prices_tenant ON public.location_prices USING ((location_id IN ( SELECT locations.id
   FROM public.locations
  WHERE (locations.tenant_id = public.current_tenant_id())))) WITH CHECK ((location_id IN ( SELECT locations.id
   FROM public.locations
  WHERE (locations.tenant_id = public.current_tenant_id()))));


--
-- Name: locations policy_locations_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY policy_locations_tenant ON public.locations USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: products policy_products_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY policy_products_tenant ON public.products USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: tenant_sequences policy_tenant_sequences_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY policy_tenant_sequences_tenant ON public.tenant_sequences USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: transfers policy_transfers_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY policy_transfers_tenant ON public.transfers USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: users policy_users_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY policy_users_tenant ON public.users USING ((tenant_id = public.current_tenant_id())) WITH CHECK ((tenant_id = public.current_tenant_id()));


--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_sequences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_sequences ENABLE ROW LEVEL SECURITY;

--
-- Name: transfers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict FG8ytzogcQeSYE4YIanVH67wp8XJjR6JrI1duUJYdS4pAN1wiJsWF5qOT3ei6ua

