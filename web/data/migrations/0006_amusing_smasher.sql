CREATE TYPE "public"."document_profile_confidence" AS ENUM('high', 'medium', 'low', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."document_profile_status" AS ENUM('ready', 'inspection_failed');--> statement-breakpoint
CREATE TABLE "document_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"inspection_status" "document_profile_status" NOT NULL,
	"confidence" "document_profile_confidence" NOT NULL,
	"document_shape" text,
	"source_form" text,
	"summary" text,
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_summary" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_profiles_document_id_unique" UNIQUE("document_id")
);
--> statement-breakpoint
ALTER TABLE "document_profiles" ADD CONSTRAINT "document_profiles_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_profiles_document_id_idx" ON "document_profiles" USING btree ("document_id");