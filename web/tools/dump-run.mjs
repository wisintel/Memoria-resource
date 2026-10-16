// One-off diagnostic: dump a pipeline run's steps with rendered prompts and
// raw model responses to tools/run-dump.json. Usage:
//   node tools/dump-run.mjs <run-id>
import { config } from "dotenv";
import postgres from "postgres";
import { writeFileSync } from "node:fs";

config({ path: ".env.local" });

const runId = process.argv[2] ?? "00ed8928-4c41-4934-a337-a80ecf361d4b";
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error("No DATABASE_URL / POSTGRES_URL in .env.local");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

const steps = await sql`
  select *
  from pipeline_run_steps
  where run_id = ${runId}
  order by step_order
`.catch(async (e) => {
  // Column names may differ; fall back to introspection.
  const cols = await sql`
    select column_name from information_schema.columns
    where table_name = 'pipeline_run_steps'
  `;
  console.error("Query failed:", e.message);
  console.error("Columns:", cols.map((c) => c.column_name).join(", "));
  process.exit(1);
});

writeFileSync("tools/run-dump.json", JSON.stringify(steps, null, 2));
console.log(
  `Wrote tools/run-dump.json — ${steps.length} steps:`,
  steps.map((s) => `${s.step}(${s.claim_count ?? "?"})`).join(", ")
);
await sql.end();
