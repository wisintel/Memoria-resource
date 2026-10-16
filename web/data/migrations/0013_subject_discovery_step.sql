ALTER TYPE "pipeline_step" ADD VALUE IF NOT EXISTS 'subject_discovery' BEFORE 'explicit_pass';
ALTER TABLE "pipeline_runs" ALTER COLUMN "current_step" SET DEFAULT 'subject_discovery';
