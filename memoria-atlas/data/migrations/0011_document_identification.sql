ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "document_form" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "structural_notes" text;
