--
-- PostgreSQL database dump
--

\restrict 36vJlYy9BvDUT743fwSLmuz0jbWikkkWywmxAZf0KBOTf6bEJnxTce6eTk8D4ZJ

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
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: claim_derivation; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.claim_derivation AS ENUM (
    'explicit',
    'inferred'
);


ALTER TYPE public.claim_derivation OWNER TO postgres;

--
-- Name: claim_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.claim_status AS ENUM (
    'accepted',
    'contested',
    'uncertain',
    'stale',
    'superseded'
);


ALTER TYPE public.claim_status OWNER TO postgres;

--
-- Name: curation_decision_kind; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.curation_decision_kind AS ENUM (
    'entity',
    'claim'
);


ALTER TYPE public.curation_decision_kind OWNER TO postgres;

--
-- Name: curation_decision_outcome; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.curation_decision_outcome AS ENUM (
    'accepted',
    'rejected',
    'merged'
);


ALTER TYPE public.curation_decision_outcome OWNER TO postgres;

--
-- Name: curation_reason; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.curation_reason AS ENUM (
    'off_domain',
    'noise',
    'trivial',
    'wrong_type',
    'duplicate',
    'premature',
    'bad_inference'
);


ALTER TYPE public.curation_reason OWNER TO postgres;

--
-- Name: curation_state; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.curation_state AS ENUM (
    'candidate',
    'needs_review',
    'canonical',
    'rejected',
    'merged'
);


ALTER TYPE public.curation_state OWNER TO postgres;

--
-- Name: document_source_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.document_source_type AS ENUM (
    'markdown',
    'paste',
    'html',
    'url',
    'pdf'
);


ALTER TYPE public.document_source_type OWNER TO postgres;

--
-- Name: document_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.document_status AS ENUM (
    'ready',
    'processing',
    'failed'
);


ALTER TYPE public.document_status OWNER TO postgres;

--
-- Name: lifecycle_state; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.lifecycle_state AS ENUM (
    'active',
    'merged',
    'revised',
    'superseded',
    'archived',
    'deleted'
);


ALTER TYPE public.lifecycle_state OWNER TO postgres;

--
-- Name: node_kind; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.node_kind AS ENUM (
    'entity',
    'claim'
);


ALTER TYPE public.node_kind OWNER TO postgres;

--
-- Name: summary_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.summary_status AS ENUM (
    'staged',
    'fresh',
    'stale'
);


ALTER TYPE public.summary_status OWNER TO postgres;

--
-- Name: view_visibility; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.view_visibility AS ENUM (
    'visible',
    'hidden',
    'collapsed',
    'metadata_only'
);


ALTER TYPE public.view_visibility OWNER TO postgres;

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION public.set_updated_at() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: claim_evidence; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.claim_evidence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    claim_id uuid NOT NULL,
    document_id uuid NOT NULL,
    chunk_position integer NOT NULL,
    quote text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.claim_evidence OWNER TO postgres;

--
-- Name: claim_subjects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.claim_subjects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    claim_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    role text DEFAULT 'subject'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.claim_subjects OWNER TO postgres;

--
-- Name: claim_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.claim_types (
    slug text NOT NULL,
    label text NOT NULL,
    description text,
    sort_order integer NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.claim_types OWNER TO postgres;

--
-- Name: claims; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_id uuid,
    document_id uuid,
    type text NOT NULL,
    statement text NOT NULL,
    derivation public.claim_derivation,
    qualifier text,
    flags text[] DEFAULT '{}'::text[] NOT NULL,
    status public.claim_status DEFAULT 'uncertain'::public.claim_status NOT NULL,
    lifecycle public.lifecycle_state DEFAULT 'active'::public.lifecycle_state NOT NULL,
    curation_state public.curation_state DEFAULT 'candidate'::public.curation_state NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.claims OWNER TO postgres;

--
-- Name: curation_decisions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.curation_decisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    domain_id uuid NOT NULL,
    kind public.curation_decision_kind NOT NULL,
    label_snapshot text NOT NULL,
    normalized_label text NOT NULL,
    type_slug text NOT NULL,
    decision public.curation_decision_outcome NOT NULL,
    reason_slug public.curation_reason,
    record_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.curation_decisions OWNER TO postgres;

--
-- Name: document_chunks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.document_chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    "position" integer NOT NULL,
    heading_path text[] DEFAULT '{}'::text[] NOT NULL,
    body text NOT NULL,
    size_bytes bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.document_chunks OWNER TO postgres;

--
-- Name: documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    source_type public.document_source_type NOT NULL,
    status public.document_status DEFAULT 'processing'::public.document_status NOT NULL,
    content_hash text NOT NULL,
    size_bytes bigint DEFAULT 0 NOT NULL,
    chunk_count integer DEFAULT 0 NOT NULL,
    original_filename text,
    source_url text,
    cleaned boolean,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.documents OWNER TO postgres;

--
-- Name: domain_entities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.domain_entities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    domain_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    role text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.domain_entities OWNER TO postgres;

--
-- Name: domain_guidance; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.domain_guidance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    domain_id uuid NOT NULL,
    body text NOT NULL,
    decision_count_at_distill integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.domain_guidance OWNER TO postgres;

--
-- Name: domains; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.domains (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    normalized_name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.domains OWNER TO postgres;

--
-- Name: entities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.entities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_id uuid,
    type text NOT NULL,
    label text NOT NULL,
    description text,
    aliases text[] DEFAULT '{}'::text[] NOT NULL,
    source_context text,
    type_proposed text,
    lifecycle public.lifecycle_state DEFAULT 'active'::public.lifecycle_state NOT NULL,
    curation_state public.curation_state DEFAULT 'candidate'::public.curation_state NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.entities OWNER TO postgres;

--
-- Name: entity_summaries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.entity_summaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_id uuid NOT NULL,
    body text NOT NULL,
    status public.summary_status DEFAULT 'staged'::public.summary_status NOT NULL,
    source_updated_at timestamp with time zone,
    generated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.entity_summaries OWNER TO postgres;

--
-- Name: entity_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.entity_types (
    slug text NOT NULL,
    label text NOT NULL,
    description text,
    sort_order integer NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.entity_types OWNER TO postgres;

--
-- Name: relationship_kinds; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.relationship_kinds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    domain_id uuid NOT NULL,
    relationship_type_slug text NOT NULL,
    slug text NOT NULL,
    label text NOT NULL,
    description text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.relationship_kinds OWNER TO postgres;

--
-- Name: relationship_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.relationship_types (
    slug text NOT NULL,
    label text NOT NULL,
    description text,
    sort_order integer NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.relationship_types OWNER TO postgres;

--
-- Name: relationships; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.relationships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_id uuid,
    relationship_kind_id uuid,
    type text NOT NULL,
    from_kind public.node_kind NOT NULL,
    from_entity_id uuid,
    from_claim_id uuid,
    to_kind public.node_kind NOT NULL,
    to_entity_id uuid,
    to_claim_id uuid,
    lifecycle public.lifecycle_state DEFAULT 'active'::public.lifecycle_state NOT NULL,
    curation_state public.curation_state DEFAULT 'candidate'::public.curation_state NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT relationships_from_endpoint CHECK ((((from_kind = 'entity'::public.node_kind) AND (from_entity_id IS NOT NULL) AND (from_claim_id IS NULL)) OR ((from_kind = 'claim'::public.node_kind) AND (from_claim_id IS NOT NULL) AND (from_entity_id IS NULL)))),
    CONSTRAINT relationships_to_endpoint CHECK ((((to_kind = 'entity'::public.node_kind) AND (to_entity_id IS NOT NULL) AND (to_claim_id IS NULL)) OR ((to_kind = 'claim'::public.node_kind) AND (to_claim_id IS NOT NULL) AND (to_entity_id IS NULL))))
);


ALTER TABLE public.relationships OWNER TO postgres;

--
-- Name: sources; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid,
    label text NOT NULL,
    content_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.sources OWNER TO postgres;

--
-- Name: view_entities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.view_entities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    view_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    visibility public.view_visibility DEFAULT 'visible'::public.view_visibility NOT NULL,
    x double precision,
    y double precision,
    pinned boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.view_entities OWNER TO postgres;

--
-- Name: view_relationships; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.view_relationships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    view_id uuid NOT NULL,
    relationship_id uuid NOT NULL,
    visibility public.view_visibility DEFAULT 'visible'::public.view_visibility NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.view_relationships OWNER TO postgres;

--
-- Name: views; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    domain_id uuid NOT NULL,
    name text NOT NULL,
    normalized_name text NOT NULL,
    description text,
    view_kind text DEFAULT 'graph'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.views OWNER TO postgres;

--
-- Name: claim_evidence claim_evidence_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.claim_evidence
    ADD CONSTRAINT claim_evidence_pkey PRIMARY KEY (id);


--
-- Name: claim_subjects claim_subjects_claim_id_entity_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.claim_subjects
    ADD CONSTRAINT claim_subjects_claim_id_entity_id_key UNIQUE (claim_id, entity_id);


--
-- Name: claim_subjects claim_subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.claim_subjects
    ADD CONSTRAINT claim_subjects_pkey PRIMARY KEY (id);


--
-- Name: claim_types claim_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.claim_types
    ADD CONSTRAINT claim_types_pkey PRIMARY KEY (slug);


--
-- Name: claims claims_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.claims
    ADD CONSTRAINT claims_pkey PRIMARY KEY (id);


--
-- Name: curation_decisions curation_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.curation_decisions
    ADD CONSTRAINT curation_decisions_pkey PRIMARY KEY (id);


--
-- Name: document_chunks document_chunks_document_id_position_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT document_chunks_document_id_position_key UNIQUE (document_id, "position");


--
-- Name: document_chunks document_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT document_chunks_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: domain_entities domain_entities_domain_id_entity_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.domain_entities
    ADD CONSTRAINT domain_entities_domain_id_entity_id_key UNIQUE (domain_id, entity_id);


--
-- Name: domain_entities domain_entities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.domain_entities
    ADD CONSTRAINT domain_entities_pkey PRIMARY KEY (id);


--
-- Name: domain_guidance domain_guidance_domain_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.domain_guidance
    ADD CONSTRAINT domain_guidance_domain_id_key UNIQUE (domain_id);


--
-- Name: domain_guidance domain_guidance_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.domain_guidance
    ADD CONSTRAINT domain_guidance_pkey PRIMARY KEY (id);


--
-- Name: domains domains_normalized_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.domains
    ADD CONSTRAINT domains_normalized_name_key UNIQUE (normalized_name);


--
-- Name: domains domains_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.domains
    ADD CONSTRAINT domains_pkey PRIMARY KEY (id);


--
-- Name: entities entities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entities
    ADD CONSTRAINT entities_pkey PRIMARY KEY (id);


--
-- Name: entity_summaries entity_summaries_entity_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entity_summaries
    ADD CONSTRAINT entity_summaries_entity_id_key UNIQUE (entity_id);


--
-- Name: entity_summaries entity_summaries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entity_summaries
    ADD CONSTRAINT entity_summaries_pkey PRIMARY KEY (id);


--
-- Name: entity_types entity_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entity_types
    ADD CONSTRAINT entity_types_pkey PRIMARY KEY (slug);


--
-- Name: relationship_kinds relationship_kinds_domain_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.relationship_kinds
    ADD CONSTRAINT relationship_kinds_domain_id_slug_key UNIQUE (domain_id, slug);


--
-- Name: relationship_kinds relationship_kinds_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.relationship_kinds
    ADD CONSTRAINT relationship_kinds_pkey PRIMARY KEY (id);


--
-- Name: relationship_types relationship_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.relationship_types
    ADD CONSTRAINT relationship_types_pkey PRIMARY KEY (slug);


--
-- Name: relationships relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.relationships
    ADD CONSTRAINT relationships_pkey PRIMARY KEY (id);


--
-- Name: sources sources_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sources
    ADD CONSTRAINT sources_pkey PRIMARY KEY (id);


--
-- Name: view_entities view_entities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.view_entities
    ADD CONSTRAINT view_entities_pkey PRIMARY KEY (id);


--
-- Name: view_entities view_entities_view_id_entity_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.view_entities
    ADD CONSTRAINT view_entities_view_id_entity_id_key UNIQUE (view_id, entity_id);


--
-- Name: view_relationships view_relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.view_relationships
    ADD CONSTRAINT view_relationships_pkey PRIMARY KEY (id);


--
-- Name: view_relationships view_relationships_view_id_relationship_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.view_relationships
    ADD CONSTRAINT view_relationships_view_id_relationship_id_key UNIQUE (view_id, relationship_id);


--
-- Name: views views_domain_id_normalized_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.views
    ADD CONSTRAINT views_domain_id_normalized_name_key UNIQUE (domain_id, normalized_name);


--
-- Name: views views_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.views
    ADD CONSTRAINT views_pkey PRIMARY KEY (id);


--
-- Name: claim_evidence_claim_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX claim_evidence_claim_id_idx ON public.claim_evidence USING btree (claim_id);


--
-- Name: claim_subjects_entity_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX claim_subjects_entity_id_idx ON public.claim_subjects USING btree (entity_id);


--
-- Name: claims_curation_state_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX claims_curation_state_idx ON public.claims USING btree (curation_state);


--
-- Name: claims_document_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX claims_document_id_idx ON public.claims USING btree (document_id);


--
-- Name: curation_decisions_domain_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX curation_decisions_domain_idx ON public.curation_decisions USING btree (domain_id, normalized_label);


--
-- Name: documents_content_hash_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX documents_content_hash_key ON public.documents USING btree (content_hash);


--
-- Name: domain_entities_entity_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX domain_entities_entity_id_idx ON public.domain_entities USING btree (entity_id);


--
-- Name: entities_curation_state_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX entities_curation_state_idx ON public.entities USING btree (curation_state);


--
-- Name: entities_label_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX entities_label_idx ON public.entities USING btree (lower(label));


--
-- Name: relationships_curation_state_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX relationships_curation_state_idx ON public.relationships USING btree (curation_state);


--
-- Name: relationships_from_claim_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX relationships_from_claim_idx ON public.relationships USING btree (from_claim_id);


--
-- Name: relationships_from_entity_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX relationships_from_entity_idx ON public.relationships USING btree (from_entity_id);


--
-- Name: relationships_to_claim_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX relationships_to_claim_idx ON public.relationships USING btree (to_claim_id);


--
-- Name: relationships_to_entity_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX relationships_to_entity_idx ON public.relationships USING btree (to_entity_id);


--
-- Name: claim_subjects claim_subjects_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER claim_subjects_set_updated_at BEFORE UPDATE ON public.claim_subjects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: claim_types claim_types_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER claim_types_set_updated_at BEFORE UPDATE ON public.claim_types FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: claims claims_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER claims_set_updated_at BEFORE UPDATE ON public.claims FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: document_chunks document_chunks_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER document_chunks_set_updated_at BEFORE UPDATE ON public.document_chunks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: documents documents_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER documents_set_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: domain_entities domain_entities_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER domain_entities_set_updated_at BEFORE UPDATE ON public.domain_entities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: domain_guidance domain_guidance_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER domain_guidance_set_updated_at BEFORE UPDATE ON public.domain_guidance FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: domains domains_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER domains_set_updated_at BEFORE UPDATE ON public.domains FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: entities entities_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER entities_set_updated_at BEFORE UPDATE ON public.entities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: entity_summaries entity_summaries_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER entity_summaries_set_updated_at BEFORE UPDATE ON public.entity_summaries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: entity_types entity_types_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER entity_types_set_updated_at BEFORE UPDATE ON public.entity_types FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: relationship_kinds relationship_kinds_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER relationship_kinds_set_updated_at BEFORE UPDATE ON public.relationship_kinds FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: relationship_types relationship_types_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER relationship_types_set_updated_at BEFORE UPDATE ON public.relationship_types FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: relationships relationships_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER relationships_set_updated_at BEFORE UPDATE ON public.relationships FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: sources sources_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER sources_set_updated_at BEFORE UPDATE ON public.sources FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: view_entities view_entities_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER view_entities_set_updated_at BEFORE UPDATE ON public.view_entities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: view_relationships view_relationships_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER view_relationships_set_updated_at BEFORE UPDATE ON public.view_relationships FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: views views_set_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER views_set_updated_at BEFORE UPDATE ON public.views FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: claim_evidence claim_evidence_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.claim_evidence
    ADD CONSTRAINT claim_evidence_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.claims(id) ON DELETE CASCADE;


--
-- Name: claim_evidence claim_evidence_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.claim_evidence
    ADD CONSTRAINT claim_evidence_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: claim_subjects claim_subjects_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.claim_subjects
    ADD CONSTRAINT claim_subjects_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.claims(id) ON DELETE CASCADE;


--
-- Name: claim_subjects claim_subjects_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.claim_subjects
    ADD CONSTRAINT claim_subjects_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(id) ON DELETE CASCADE;


--
-- Name: claims claims_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.claims
    ADD CONSTRAINT claims_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL;


--
-- Name: claims claims_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.claims
    ADD CONSTRAINT claims_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.sources(id) ON DELETE SET NULL;


--
-- Name: curation_decisions curation_decisions_domain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.curation_decisions
    ADD CONSTRAINT curation_decisions_domain_id_fkey FOREIGN KEY (domain_id) REFERENCES public.domains(id) ON DELETE CASCADE;


--
-- Name: document_chunks document_chunks_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT document_chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: domain_entities domain_entities_domain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.domain_entities
    ADD CONSTRAINT domain_entities_domain_id_fkey FOREIGN KEY (domain_id) REFERENCES public.domains(id) ON DELETE CASCADE;


--
-- Name: domain_entities domain_entities_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.domain_entities
    ADD CONSTRAINT domain_entities_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(id) ON DELETE CASCADE;


--
-- Name: domain_guidance domain_guidance_domain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.domain_guidance
    ADD CONSTRAINT domain_guidance_domain_id_fkey FOREIGN KEY (domain_id) REFERENCES public.domains(id) ON DELETE CASCADE;


--
-- Name: entities entities_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entities
    ADD CONSTRAINT entities_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.sources(id) ON DELETE SET NULL;


--
-- Name: entity_summaries entity_summaries_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.entity_summaries
    ADD CONSTRAINT entity_summaries_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(id) ON DELETE CASCADE;


--
-- Name: relationship_kinds relationship_kinds_domain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.relationship_kinds
    ADD CONSTRAINT relationship_kinds_domain_id_fkey FOREIGN KEY (domain_id) REFERENCES public.domains(id) ON DELETE CASCADE;


--
-- Name: relationship_kinds relationship_kinds_relationship_type_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.relationship_kinds
    ADD CONSTRAINT relationship_kinds_relationship_type_slug_fkey FOREIGN KEY (relationship_type_slug) REFERENCES public.relationship_types(slug);


--
-- Name: relationships relationships_from_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.relationships
    ADD CONSTRAINT relationships_from_claim_id_fkey FOREIGN KEY (from_claim_id) REFERENCES public.claims(id) ON DELETE CASCADE;


--
-- Name: relationships relationships_from_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.relationships
    ADD CONSTRAINT relationships_from_entity_id_fkey FOREIGN KEY (from_entity_id) REFERENCES public.entities(id) ON DELETE CASCADE;


--
-- Name: relationships relationships_relationship_kind_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.relationships
    ADD CONSTRAINT relationships_relationship_kind_id_fkey FOREIGN KEY (relationship_kind_id) REFERENCES public.relationship_kinds(id) ON DELETE SET NULL;


--
-- Name: relationships relationships_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.relationships
    ADD CONSTRAINT relationships_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.sources(id) ON DELETE SET NULL;


--
-- Name: relationships relationships_to_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.relationships
    ADD CONSTRAINT relationships_to_claim_id_fkey FOREIGN KEY (to_claim_id) REFERENCES public.claims(id) ON DELETE CASCADE;


--
-- Name: relationships relationships_to_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.relationships
    ADD CONSTRAINT relationships_to_entity_id_fkey FOREIGN KEY (to_entity_id) REFERENCES public.entities(id) ON DELETE CASCADE;


--
-- Name: sources sources_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sources
    ADD CONSTRAINT sources_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL;


--
-- Name: view_entities view_entities_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.view_entities
    ADD CONSTRAINT view_entities_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(id) ON DELETE CASCADE;


--
-- Name: view_entities view_entities_view_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.view_entities
    ADD CONSTRAINT view_entities_view_id_fkey FOREIGN KEY (view_id) REFERENCES public.views(id) ON DELETE CASCADE;


--
-- Name: view_relationships view_relationships_relationship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.view_relationships
    ADD CONSTRAINT view_relationships_relationship_id_fkey FOREIGN KEY (relationship_id) REFERENCES public.relationships(id) ON DELETE CASCADE;


--
-- Name: view_relationships view_relationships_view_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.view_relationships
    ADD CONSTRAINT view_relationships_view_id_fkey FOREIGN KEY (view_id) REFERENCES public.views(id) ON DELETE CASCADE;


--
-- Name: views views_domain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.views
    ADD CONSTRAINT views_domain_id_fkey FOREIGN KEY (domain_id) REFERENCES public.domains(id) ON DELETE CASCADE;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: TABLE claim_evidence; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.claim_evidence TO anon;
GRANT ALL ON TABLE public.claim_evidence TO authenticated;
GRANT ALL ON TABLE public.claim_evidence TO service_role;


--
-- Name: TABLE claim_subjects; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.claim_subjects TO anon;
GRANT ALL ON TABLE public.claim_subjects TO authenticated;
GRANT ALL ON TABLE public.claim_subjects TO service_role;


--
-- Name: TABLE claim_types; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.claim_types TO anon;
GRANT ALL ON TABLE public.claim_types TO authenticated;
GRANT ALL ON TABLE public.claim_types TO service_role;


--
-- Name: TABLE claims; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.claims TO anon;
GRANT ALL ON TABLE public.claims TO authenticated;
GRANT ALL ON TABLE public.claims TO service_role;


--
-- Name: TABLE curation_decisions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.curation_decisions TO anon;
GRANT ALL ON TABLE public.curation_decisions TO authenticated;
GRANT ALL ON TABLE public.curation_decisions TO service_role;


--
-- Name: TABLE document_chunks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.document_chunks TO anon;
GRANT ALL ON TABLE public.document_chunks TO authenticated;
GRANT ALL ON TABLE public.document_chunks TO service_role;


--
-- Name: TABLE documents; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.documents TO anon;
GRANT ALL ON TABLE public.documents TO authenticated;
GRANT ALL ON TABLE public.documents TO service_role;


--
-- Name: TABLE domain_entities; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.domain_entities TO anon;
GRANT ALL ON TABLE public.domain_entities TO authenticated;
GRANT ALL ON TABLE public.domain_entities TO service_role;


--
-- Name: TABLE domain_guidance; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.domain_guidance TO anon;
GRANT ALL ON TABLE public.domain_guidance TO authenticated;
GRANT ALL ON TABLE public.domain_guidance TO service_role;


--
-- Name: TABLE domains; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.domains TO anon;
GRANT ALL ON TABLE public.domains TO authenticated;
GRANT ALL ON TABLE public.domains TO service_role;


--
-- Name: TABLE entities; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.entities TO anon;
GRANT ALL ON TABLE public.entities TO authenticated;
GRANT ALL ON TABLE public.entities TO service_role;


--
-- Name: TABLE entity_summaries; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.entity_summaries TO anon;
GRANT ALL ON TABLE public.entity_summaries TO authenticated;
GRANT ALL ON TABLE public.entity_summaries TO service_role;


--
-- Name: TABLE entity_types; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.entity_types TO anon;
GRANT ALL ON TABLE public.entity_types TO authenticated;
GRANT ALL ON TABLE public.entity_types TO service_role;


--
-- Name: TABLE relationship_kinds; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.relationship_kinds TO anon;
GRANT ALL ON TABLE public.relationship_kinds TO authenticated;
GRANT ALL ON TABLE public.relationship_kinds TO service_role;


--
-- Name: TABLE relationship_types; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.relationship_types TO anon;
GRANT ALL ON TABLE public.relationship_types TO authenticated;
GRANT ALL ON TABLE public.relationship_types TO service_role;


--
-- Name: TABLE relationships; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.relationships TO anon;
GRANT ALL ON TABLE public.relationships TO authenticated;
GRANT ALL ON TABLE public.relationships TO service_role;


--
-- Name: TABLE sources; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.sources TO anon;
GRANT ALL ON TABLE public.sources TO authenticated;
GRANT ALL ON TABLE public.sources TO service_role;


--
-- Name: TABLE view_entities; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.view_entities TO anon;
GRANT ALL ON TABLE public.view_entities TO authenticated;
GRANT ALL ON TABLE public.view_entities TO service_role;


--
-- Name: TABLE view_relationships; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.view_relationships TO anon;
GRANT ALL ON TABLE public.view_relationships TO authenticated;
GRANT ALL ON TABLE public.view_relationships TO service_role;


--
-- Name: TABLE views; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.views TO anon;
GRANT ALL ON TABLE public.views TO authenticated;
GRANT ALL ON TABLE public.views TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict 36vJlYy9BvDUT743fwSLmuz0jbWikkkWywmxAZf0KBOTf6bEJnxTce6eTk8D4ZJ

