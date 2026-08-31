-- STS Legacy Cold baseline: schema-only export from the current production structure.
-- Generated through a PostgreSQL read-only transaction. Contains no table data.
-- Intentional sanitization: no owners/ACLs; pg_dump session tokens removed;
-- public schema creation made idempotent for a fresh Supabase project.
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11

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
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: is_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin(user_id uuid DEFAULT auth.uid()) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.id = user_id
      and p.role = 'admin'
      and p.is_active = true
  );
$$;


--
-- Name: is_super_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_super_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'super_admin'
      and is_active = true
  );
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alerts (
    id bigint NOT NULL,
    device_id text NOT NULL,
    temperature real NOT NULL,
    humidity real NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    type text,
    message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    event text,
    title text
);


--
-- Name: alerts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alerts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alerts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alerts_id_seq OWNED BY public.alerts.id;


--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text,
    contact_name text,
    contact_email text,
    contact_phone text,
    plan text DEFAULT 'starter'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: device_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_access (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    device_id text NOT NULL,
    can_view boolean DEFAULT true NOT NULL,
    can_edit boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: device_access_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.device_access ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.device_access_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text,
    full_name text,
    role text DEFAULT 'client'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    client_id uuid,
    can_change_password boolean DEFAULT false,
    password_updated_at timestamp without time zone,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['super_admin'::text, 'client_admin'::text, 'viewer'::text])))
);


--
-- Name: device_access_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.device_access_view WITH (security_invoker='on') AS
 SELECT da.id,
    da.user_id,
    p.full_name,
    p.email,
    da.device_id,
    da.can_view,
    da.can_edit,
    da.created_at
   FROM (public.device_access da
     LEFT JOIN public.profiles p ON ((p.id = da.user_id)));


--
-- Name: device_alert_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_alert_recipients (
    id bigint NOT NULL,
    device_id text NOT NULL,
    email text NOT NULL,
    name text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    temp_alerts boolean DEFAULT true NOT NULL,
    humidity_alerts boolean DEFAULT true NOT NULL,
    offline_alerts boolean DEFAULT true NOT NULL,
    predictive_alerts boolean DEFAULT false NOT NULL
);


--
-- Name: device_alert_recipients_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.device_alert_recipients ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.device_alert_recipients_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.devices (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    device_id text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone,
    last_seen timestamp with time zone,
    last_temperature real,
    last_humidity real,
    status text DEFAULT 'NORMAL'::text,
    config jsonb DEFAULT '{"hyst_c": 0.5, "temp_high_c": 30.0, "send_interval_s": 30, "display_standby_min": 10}'::jsonb,
    config_version integer DEFAULT 1,
    name text,
    location text,
    client_id uuid,
    pairing_code text,
    pairing_status text DEFAULT 'unassigned'::text NOT NULL,
    paired_at timestamp with time zone,
    paired_by uuid,
    last_contact_at timestamp with time zone
);


--
-- Name: readings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.readings (
    id bigint NOT NULL,
    device_id text NOT NULL,
    temperature real NOT NULL,
    humidity real NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    device_status text,
    alarm_ack boolean DEFAULT false NOT NULL,
    alarm_ack_count integer DEFAULT 0 NOT NULL,
    alarm_ack_time text,
    alarm_ack_age_s integer,
    alarm_event_count integer DEFAULT 0 NOT NULL,
    alarm_event_time text,
    alarm_event_age_s integer,
    alarm_mask integer DEFAULT 0 NOT NULL,
    alarm_reason text,
    telemetry_seq bigint,
    sample_age_s integer,
    sample_epoch bigint,
    delivery_attempts integer DEFAULT 0 NOT NULL,
    offline_captured boolean DEFAULT false NOT NULL
);


--
-- Name: latest_device_readings; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.latest_device_readings WITH (security_invoker='on') AS
 SELECT DISTINCT ON (r.device_id) d.device_id,
    d.name,
    d.location,
    d.status,
    r.temperature,
    r.humidity,
    r.created_at
   FROM (public.readings r
     JOIN public.devices d ON ((d.device_id = r.device_id)))
  ORDER BY r.device_id, r.created_at DESC;


--
-- Name: readings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.readings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: readings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.readings_id_seq OWNED BY public.readings.id;


--
-- Name: user_device_permissions; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.user_device_permissions WITH (security_invoker='on') AS
 SELECT p.id AS user_id,
    p.full_name,
    p.email,
    p.role,
    p.is_active,
    da.device_id,
    da.can_view,
    da.can_edit,
    da.created_at AS access_created_at
   FROM (public.profiles p
     LEFT JOIN public.device_access da ON ((da.user_id = p.id)))
  ORDER BY p.role, p.full_name, p.email, da.device_id;


--
-- Name: alerts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts ALTER COLUMN id SET DEFAULT nextval('public.alerts_id_seq'::regclass);


--
-- Name: readings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readings ALTER COLUMN id SET DEFAULT nextval('public.readings_id_seq'::regclass);


--
-- Name: alerts alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_pkey PRIMARY KEY (id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: clients clients_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_slug_key UNIQUE (slug);


--
-- Name: device_access device_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_access
    ADD CONSTRAINT device_access_pkey PRIMARY KEY (id);


--
-- Name: device_access device_access_user_id_device_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_access
    ADD CONSTRAINT device_access_user_id_device_id_key UNIQUE (user_id, device_id);


--
-- Name: device_alert_recipients device_alert_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_alert_recipients
    ADD CONSTRAINT device_alert_recipients_pkey PRIMARY KEY (id);


--
-- Name: devices devices_pairing_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_pairing_code_key UNIQUE (pairing_code);


--
-- Name: devices devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_pkey PRIMARY KEY (device_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: readings readings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readings
    ADD CONSTRAINT readings_pkey PRIMARY KEY (id);


--
-- Name: device_alert_recipients_device_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX device_alert_recipients_device_id_idx ON public.device_alert_recipients USING btree (device_id);


--
-- Name: device_alert_recipients_device_user_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX device_alert_recipients_device_user_unique ON public.device_alert_recipients USING btree (device_id, user_id) WHERE (user_id IS NOT NULL);


--
-- Name: devices_last_contact_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX devices_last_contact_at_idx ON public.devices USING btree (last_contact_at DESC);


--
-- Name: idx_alerts_device_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alerts_device_created_at ON public.alerts USING btree (device_id, created_at DESC);


--
-- Name: idx_device_access_device_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_access_device_id ON public.device_access USING btree (device_id);


--
-- Name: idx_device_access_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_access_user_id ON public.device_access USING btree (user_id);


--
-- Name: idx_device_alert_recipients_device_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_alert_recipients_device_id ON public.device_alert_recipients USING btree (device_id);


--
-- Name: idx_devices_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_devices_client_id ON public.devices USING btree (client_id);


--
-- Name: idx_devices_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_devices_updated_at ON public.devices USING btree (updated_at DESC);


--
-- Name: idx_profiles_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_client_id ON public.profiles USING btree (client_id);


--
-- Name: idx_readings_device_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_readings_device_created_at ON public.readings USING btree (device_id, created_at DESC);


--
-- Name: readings_device_offline_captured_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX readings_device_offline_captured_created_idx ON public.readings USING btree (device_id, offline_captured, created_at DESC);


--
-- Name: device_access device_access_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_access
    ADD CONSTRAINT device_access_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.devices(device_id) ON DELETE CASCADE;


--
-- Name: device_access device_access_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_access
    ADD CONSTRAINT device_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: device_alert_recipients device_alert_recipients_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_alert_recipients
    ADD CONSTRAINT device_alert_recipients_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.devices(device_id) ON DELETE CASCADE;


--
-- Name: device_alert_recipients device_alert_recipients_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_alert_recipients
    ADD CONSTRAINT device_alert_recipients_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: devices devices_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: alerts alerts_select_by_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY alerts_select_by_access ON public.alerts FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.device_access da
  WHERE ((da.device_id = alerts.device_id) AND (da.user_id = auth.uid()) AND (da.can_view = true)))));


--
-- Name: alerts alerts_super_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY alerts_super_admin_select ON public.alerts FOR SELECT TO authenticated USING (public.is_super_admin());


--
-- Name: clients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

--
-- Name: device_access; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.device_access ENABLE ROW LEVEL SECURITY;

--
-- Name: device_access device_access_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY device_access_select_own ON public.device_access FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: device_access device_access_super_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY device_access_super_admin_all ON public.device_access TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: device_alert_recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.device_alert_recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: device_alert_recipients device_alert_recipients_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY device_alert_recipients_admin_all ON public.device_alert_recipients TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: devices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

--
-- Name: devices devices_select_by_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY devices_select_by_access ON public.devices FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.device_access da
  WHERE ((da.device_id = devices.device_id) AND (da.user_id = auth.uid()) AND (da.can_view = true)))));


--
-- Name: devices devices_super_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY devices_super_admin_select ON public.devices FOR SELECT TO authenticated USING (public.is_super_admin());


--
-- Name: devices devices_super_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY devices_super_admin_update ON public.devices FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: devices devices_update_by_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY devices_update_by_access ON public.devices FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.device_access da
  WHERE ((da.device_id = devices.device_id) AND (da.user_id = auth.uid()) AND (da.can_edit = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.device_access da
  WHERE ((da.device_id = devices.device_id) AND (da.user_id = auth.uid()) AND (da.can_edit = true)))));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated USING ((id = auth.uid()));


--
-- Name: profiles profiles_select_super_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_super_admin ON public.profiles FOR SELECT TO authenticated USING (public.is_super_admin());


--
-- Name: profiles profiles_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));


--
-- Name: readings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.readings ENABLE ROW LEVEL SECURITY;

--
-- Name: readings readings_select_by_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY readings_select_by_access ON public.readings FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.device_access da
  WHERE ((da.device_id = readings.device_id) AND (da.user_id = auth.uid()) AND (da.can_view = true)))));


--
-- Name: readings readings_super_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY readings_super_admin_select ON public.readings FOR SELECT TO authenticated USING (public.is_super_admin());


--
-- Name: device_alert_recipients super_admin_can_delete_device_alert_recipients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY super_admin_can_delete_device_alert_recipients ON public.device_alert_recipients FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'super_admin'::text)))));


--
-- Name: profiles super_admin_can_delete_profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY super_admin_can_delete_profiles ON public.profiles FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'super_admin'::text)))));


--
-- Name: device_alert_recipients super_admin_can_insert_device_alert_recipients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY super_admin_can_insert_device_alert_recipients ON public.device_alert_recipients FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'super_admin'::text)))));


--
-- Name: device_alert_recipients super_admin_can_select_device_alert_recipients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY super_admin_can_select_device_alert_recipients ON public.device_alert_recipients FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'super_admin'::text)))));


--
-- Name: device_alert_recipients super_admin_can_update_device_alert_recipients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY super_admin_can_update_device_alert_recipients ON public.device_alert_recipients FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'super_admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'super_admin'::text)))));


--
-- Name: profiles super_admin_can_update_profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY super_admin_can_update_profiles ON public.profiles FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'super_admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'super_admin'::text)))));


--
-- PostgreSQL database dump complete
--
