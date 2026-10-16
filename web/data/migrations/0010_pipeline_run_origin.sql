CREATE TYPE "pipeline_run_origin" AS ENUM ('extraction');
--> statement-breakpoint
ALTER TABLE "pipeline_runs" ALTER COLUMN "document_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD COLUMN "origin" "pipeline_run_origin" DEFAULT 'extraction' NOT NULL;
