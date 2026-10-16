CREATE TABLE "shelf_folder_items" (
	"folder_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shelf_folder_items_folder_item_pk" PRIMARY KEY("folder_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "shelf_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"scope" text DEFAULT 'documents' NOT NULL,
	"label" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"collapsed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shelf_folder_items" ADD CONSTRAINT "shelf_folder_items_folder_id_shelf_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."shelf_folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelf_folder_items" ADD CONSTRAINT "shelf_folder_items_item_id_documents_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelf_folders" ADD CONSTRAINT "shelf_folders_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shelf_folder_items_item_id_idx" ON "shelf_folder_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "shelf_folders_domain_scope_idx" ON "shelf_folders" USING btree ("domain_id","scope");