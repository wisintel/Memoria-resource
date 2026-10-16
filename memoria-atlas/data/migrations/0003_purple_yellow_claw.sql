CREATE TABLE "composer_session_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"event_index" integer NOT NULL,
	"event" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "composer_session_events_event_index_nonnegative" CHECK ("composer_session_events"."event_index" >= 0)
);
--> statement-breakpoint
CREATE TABLE "composer_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text,
	"title" text DEFAULT 'New chat' NOT NULL,
	"eve_session" jsonb,
	"pending_user_message" text,
	"pending_user_message_created_at" timestamp with time zone,
	"domain_id" uuid,
	"surface" text,
	"selected_record_class_key" text,
	"selected_record_id" uuid,
	"document_id" uuid,
	"active_source_unit_id" uuid,
	"domain_map_id" uuid,
	"context_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "composer_session_events" ADD CONSTRAINT "composer_session_events_session_id_composer_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."composer_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "composer_sessions" ADD CONSTRAINT "composer_sessions_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "composer_sessions" ADD CONSTRAINT "composer_sessions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "composer_sessions" ADD CONSTRAINT "composer_sessions_active_source_unit_id_source_units_id_fk" FOREIGN KEY ("active_source_unit_id") REFERENCES "public"."source_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "composer_sessions" ADD CONSTRAINT "composer_sessions_domain_map_id_domain_maps_id_fk" FOREIGN KEY ("domain_map_id") REFERENCES "public"."domain_maps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "composer_session_events_session_idx" ON "composer_session_events" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "composer_session_events_session_index_unique" ON "composer_session_events" USING btree ("session_id","event_index");--> statement-breakpoint
CREATE INDEX "composer_sessions_owner_updated_idx" ON "composer_sessions" USING btree ("owner_user_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "composer_sessions_domain_updated_idx" ON "composer_sessions" USING btree ("domain_id","updated_at");--> statement-breakpoint
CREATE INDEX "composer_sessions_domain_map_updated_idx" ON "composer_sessions" USING btree ("domain_map_id","updated_at");--> statement-breakpoint
CREATE INDEX "composer_sessions_document_updated_idx" ON "composer_sessions" USING btree ("document_id","updated_at");