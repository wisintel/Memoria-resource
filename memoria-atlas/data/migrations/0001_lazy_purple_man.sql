CREATE TYPE "public"."assertion_state" AS ENUM('candidate', 'accepted', 'rejected', 'deferred', 'superseded', 'review_needed');--> statement-breakpoint
CREATE TYPE "public"."evidence_link_role" AS ENUM('supports', 'contradicts', 'qualifies', 'provenance');--> statement-breakpoint
CREATE TYPE "public"."map_visibility" AS ENUM('visible', 'hidden', 'collapsed', 'metadata_only');--> statement-breakpoint
CREATE TABLE "claim_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"target_object_id" uuid NOT NULL,
	"target_role" text DEFAULT 'about' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claim_targets_claim_target_role_unique" UNIQUE("claim_id","target_object_id","target_role")
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"claim_text" text NOT NULL,
	"claim_type_id" uuid,
	"status_id" uuid,
	"assertion_state" "assertion_state" DEFAULT 'accepted' NOT NULL,
	"confidence" text,
	"source" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"document_type_id" uuid,
	"source_type" text DEFAULT 'markdown' NOT NULL,
	"status_id" uuid,
	"preparation_state" text DEFAULT 'not_started' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"content_sha256" text DEFAULT '' NOT NULL,
	"body_sha256" text DEFAULT '' NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"intake_profile" text DEFAULT '' NOT NULL,
	"source_filename" text,
	"source_url" text,
	"mime_type" text,
	"shard_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"source" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"unit_type" text DEFAULT 'chunk' NOT NULL,
	"heading_path" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"body" text NOT NULL,
	"locator" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"content_sha256" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_units_document_position_unique" UNIQUE("document_id","position")
);
--> statement-breakpoint
CREATE TABLE "domain_map_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_map_id" uuid NOT NULL,
	"object_id" uuid NOT NULL,
	"node_role" text DEFAULT 'member' NOT NULL,
	"visibility" "map_visibility" DEFAULT 'visible' NOT NULL,
	"position" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"layout_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domain_map_nodes_map_object_unique" UNIQUE("domain_map_id","object_id")
);
--> statement-breakpoint
CREATE TABLE "domain_map_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_map_id" uuid NOT NULL,
	"relationship_id" uuid NOT NULL,
	"visibility" "map_visibility" DEFAULT 'visible' NOT NULL,
	"layout_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domain_map_relationships_map_relationship_unique" UNIQUE("domain_map_id","relationship_id")
);
--> statement-breakpoint
CREATE TABLE "domain_maps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"map_kind_type_id" uuid,
	"description" text DEFAULT '' NOT NULL,
	"status_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domain_maps_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_kind" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_document_id" uuid,
	"source_unit_id" uuid,
	"locator" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"status_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_id" uuid NOT NULL,
	"target_object_id" uuid NOT NULL,
	"link_role" "evidence_link_role" DEFAULT 'supports' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_links_evidence_target_role_unique" UNIQUE("evidence_id","target_object_id","link_role")
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"canonical_label" text NOT NULL,
	"subject_type_id" uuid,
	"description" text DEFAULT '' NOT NULL,
	"status_id" uuid,
	"source" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relationships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_object_id" uuid NOT NULL,
	"target_object_id" uuid NOT NULL,
	"relationship_type_id" uuid,
	"status_id" uuid,
	"assertion_state" "assertion_state" DEFAULT 'accepted' NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"source" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lexicalizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"object_id" uuid NOT NULL,
	"lexical_type" text DEFAULT 'alias' NOT NULL,
	"value" text NOT NULL,
	"normalized_value" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"domain_id" uuid,
	"status_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "claim_targets" ADD CONSTRAINT "claim_targets_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_targets" ADD CONSTRAINT "claim_targets_target_object_id_objects_id_fk" FOREIGN KEY ("target_object_id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_id_objects_id_fk" FOREIGN KEY ("id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_claim_type_id_types_id_fk" FOREIGN KEY ("claim_type_id") REFERENCES "public"."types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_status_id_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_id_objects_id_fk" FOREIGN KEY ("id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_document_type_id_types_id_fk" FOREIGN KEY ("document_type_id") REFERENCES "public"."types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_status_id_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_units" ADD CONSTRAINT "source_units_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_map_nodes" ADD CONSTRAINT "domain_map_nodes_domain_map_id_domain_maps_id_fk" FOREIGN KEY ("domain_map_id") REFERENCES "public"."domain_maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_map_nodes" ADD CONSTRAINT "domain_map_nodes_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_map_relationships" ADD CONSTRAINT "domain_map_relationships_domain_map_id_domain_maps_id_fk" FOREIGN KEY ("domain_map_id") REFERENCES "public"."domain_maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_map_relationships" ADD CONSTRAINT "domain_map_relationships_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_maps" ADD CONSTRAINT "domain_maps_id_objects_id_fk" FOREIGN KEY ("id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_maps" ADD CONSTRAINT "domain_maps_map_kind_type_id_types_id_fk" FOREIGN KEY ("map_kind_type_id") REFERENCES "public"."types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_maps" ADD CONSTRAINT "domain_maps_status_id_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_source_document_id_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_source_unit_id_source_units_id_fk" FOREIGN KEY ("source_unit_id") REFERENCES "public"."source_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_status_id_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_target_object_id_objects_id_fk" FOREIGN KEY ("target_object_id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_id_objects_id_fk" FOREIGN KEY ("id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_subject_type_id_types_id_fk" FOREIGN KEY ("subject_type_id") REFERENCES "public"."types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_status_id_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_id_objects_id_fk" FOREIGN KEY ("id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_source_object_id_objects_id_fk" FOREIGN KEY ("source_object_id") REFERENCES "public"."objects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_target_object_id_objects_id_fk" FOREIGN KEY ("target_object_id") REFERENCES "public"."objects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_relationship_type_id_types_id_fk" FOREIGN KEY ("relationship_type_id") REFERENCES "public"."types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_status_id_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexicalizations" ADD CONSTRAINT "lexicalizations_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexicalizations" ADD CONSTRAINT "lexicalizations_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexicalizations" ADD CONSTRAINT "lexicalizations_status_id_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claim_targets_target_object_id_idx" ON "claim_targets" USING btree ("target_object_id");--> statement-breakpoint
CREATE INDEX "claims_claim_type_id_idx" ON "claims" USING btree ("claim_type_id");--> statement-breakpoint
CREATE INDEX "claims_status_id_idx" ON "claims" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX "claims_assertion_state_idx" ON "claims" USING btree ("assertion_state");--> statement-breakpoint
CREATE INDEX "documents_document_type_id_idx" ON "documents" USING btree ("document_type_id");--> statement-breakpoint
CREATE INDEX "documents_status_id_idx" ON "documents" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX "documents_content_sha256_idx" ON "documents" USING btree ("content_sha256");--> statement-breakpoint
CREATE INDEX "source_units_document_id_idx" ON "source_units" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "domain_map_nodes_object_id_idx" ON "domain_map_nodes" USING btree ("object_id");--> statement-breakpoint
CREATE INDEX "domain_map_relationships_relationship_id_idx" ON "domain_map_relationships" USING btree ("relationship_id");--> statement-breakpoint
CREATE INDEX "domain_maps_map_kind_type_id_idx" ON "domain_maps" USING btree ("map_kind_type_id");--> statement-breakpoint
CREATE INDEX "domain_maps_status_id_idx" ON "domain_maps" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX "evidence_source_document_id_idx" ON "evidence" USING btree ("source_document_id");--> statement-breakpoint
CREATE INDEX "evidence_source_unit_id_idx" ON "evidence" USING btree ("source_unit_id");--> statement-breakpoint
CREATE INDEX "evidence_links_target_object_id_idx" ON "evidence_links" USING btree ("target_object_id");--> statement-breakpoint
CREATE INDEX "subjects_subject_type_id_idx" ON "subjects" USING btree ("subject_type_id");--> statement-breakpoint
CREATE INDEX "subjects_status_id_idx" ON "subjects" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX "relationships_source_object_id_idx" ON "relationships" USING btree ("source_object_id");--> statement-breakpoint
CREATE INDEX "relationships_target_object_id_idx" ON "relationships" USING btree ("target_object_id");--> statement-breakpoint
CREATE INDEX "relationships_relationship_type_id_idx" ON "relationships" USING btree ("relationship_type_id");--> statement-breakpoint
CREATE INDEX "relationships_status_id_idx" ON "relationships" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX "lexicalizations_object_id_idx" ON "lexicalizations" USING btree ("object_id");--> statement-breakpoint
CREATE INDEX "lexicalizations_normalized_value_idx" ON "lexicalizations" USING btree ("normalized_value");