import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_DOMAINS_ID, NO_DOMAIN_ID, db, ensureTypeCard, get, id, now, run } from "./db.mjs";
import { byteCount, documentShardsForSource } from "./document-sharding.mjs";

const serverDir = dirname(fileURLToPath(import.meta.url));
const vaultRoot = resolve(serverDir, "../..");
const markerRoot = join(vaultRoot, "tools", "marker");
const markerPython = join(markerRoot, ".venv", "bin", "python");
const markerSingleScript = join(markerRoot, "convert_single.py");

export async function importDocumentPayload(body) {
  const timestamp = now();
  const domainId = optionalDomainId(body.domain_id);
  const sourceType = documentSourceType(body.source_type);
  const content = typeof body.content === "string" ? body.content : "";

  if (!content.trim()) {
    throw new Error("Document content is required.");
  }

  const sourceFilename = nullableText(body.source_filename);
  const label = nullableText(body.label) ?? fallbackTitle(sourceFilename);
  const mimeType = nullableText(body.mime_type) ?? mimeTypeForSource(sourceType);
  const sizeBytes = byteCount(content);
  const contentSha256 = sha256Hex(content);
  const existing = domainId
    ? get(
        `
          SELECT id
          FROM documents
          WHERE domain_id = ?
            AND content_sha256 = ?
          LIMIT 1
        `,
        domainId,
        contentSha256
      )
    : get(
        `
          SELECT id
          FROM documents
          WHERE domain_id IS NULL
            AND content_sha256 = ?
          LIMIT 1
        `,
        contentSha256
      );

  if (existing?.id) {
    return {
      deduped: true,
      documentId: existing.id
    };
  }

  const documentId = id("document");
  const shards = documentShardsForSource(sourceType, content);
  const documentTypeId = ensureTypeCard({ appliesTo: "document", label: "Source", slug: "source" });
  const intakeProfile = nullableText(body.intake_profile) ?? sourceType;
  const extractionStage = nullableText(body.extraction_stage) ?? "not_started";
  const source = nullableText(body.source) ?? sourceFilename;

  db.exec("BEGIN");
  try {
    run(
      `
        INSERT INTO documents (
          id,
          domain_id,
          label,
          document_type_id,
          source_type,
          status,
          extraction_stage,
          content_sha256,
          body_sha256,
          size_bytes,
          intake_profile,
          source_filename,
          mime_type,
          shard_count,
          created,
          updated,
          source
        )
        VALUES (?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      documentId,
      domainId,
      label,
      documentTypeId,
      sourceType,
      extractionStage,
      contentSha256,
      contentSha256,
      sizeBytes,
      intakeProfile,
      sourceFilename,
      mimeType,
      shards.length,
      timestamp,
      timestamp,
      source
    );

    for (const shard of shards) {
      run(
        `
          INSERT INTO source_units (
            id,
            document_id,
            position,
            heading_path_json,
            body,
            size_bytes,
            created,
            updated
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        id("document_shard"),
        documentId,
        shard.position,
        JSON.stringify(shard.headingPath),
        shard.body,
        shard.sizeBytes,
        timestamp,
        timestamp
      );
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    deduped: false,
    documentId
  };
}

export async function importPdfBufferAsDocument({ buffer, domain_id, label, mime_type, source_filename }) {
  const filename = source_filename || "uploaded.pdf";
  const tempDir = await mkdtemp(join(tmpdir(), "memoria-pdf-upload-"));
  const pdfPath = join(tempDir, safePdfFilename(filename));

  try {
    await writeFile(pdfPath, buffer);
    return await importPdfPathAsDocument({
      domain_id,
      label,
      mime_type,
      pdfPath,
      source_filename: filename
    });
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

export async function importPdfPathAsDocument({ domain_id, label, mime_type, pdfPath, source_filename }) {
  const absolutePdfPath = resolve(pdfPath);

  if (!existsSync(absolutePdfPath)) {
    throw new Error(`PDF file does not exist: ${absolutePdfPath}`);
  }

  const converted = await convertPdfToMarkdown(absolutePdfPath);
  const filename = source_filename || basename(absolutePdfPath);

  return importDocumentPayload({
    content: converted.markdown,
    domain_id,
    intake_profile: "pdf",
    label: label ?? fallbackTitle(filename),
    mime_type: mime_type ?? "application/pdf",
    source: filename,
    source_filename: filename,
    source_type: "markdown",
    type: "pdf"
  });
}

export async function convertPdfToMarkdown(pdfPath) {
  if (!existsSync(markerPython) || !existsSync(markerSingleScript)) {
    throw new Error("Marker runtime is not available under tools/marker.");
  }

  const outputDir = await mkdtemp(join(tmpdir(), "memoria-marker-output-"));

  try {
    const result = spawnSync(
      markerPython,
      [markerSingleScript, pdfPath, "--output_dir", outputDir, "--output_format", "markdown", "--disable_tqdm"],
      {
        cwd: markerRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          PYTHONPATH: markerRoot
        },
        maxBuffer: 1024 * 1024 * 50
      }
    );

    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || "Marker conversion failed.");
    }

    const markdownFiles = await walkFiles(outputDir, ".md");

    if (markdownFiles.length === 0) {
      throw new Error("Marker did not produce a Markdown file.");
    }

    const markdownPath = markdownFiles.sort((left, right) => left.localeCompare(right))[0];
    const markdown = await readFile(markdownPath, "utf8");

    if (!markdown.trim()) {
      throw new Error("Marker produced an empty Markdown document.");
    }

    return {
      markdown,
      markdownPath
    };
  } finally {
    await rm(outputDir, { force: true, recursive: true });
  }
}

export function isPdfUpload(body) {
  const mimeType = nullableText(body.mime_type)?.toLowerCase() ?? "";
  const filename = nullableText(body.source_filename)?.toLowerCase() ?? "";

  return mimeType === "application/pdf" || filename.endsWith(".pdf");
}

export function decodeBase64Upload(body) {
  const base64 = nullableText(body.data_base64);

  if (!base64) {
    throw new Error("Uploaded file data is required.");
  }

  return Buffer.from(base64, "base64");
}

function documentSourceType(value) {
  const sourceType = nullableText(value) ?? "markdown";

  if (sourceType !== "markdown" && sourceType !== "html") {
    throw new Error("Only Markdown and HTML documents can be imported.");
  }

  return sourceType;
}

function optionalDomainId(value) {
  const domainId = nullableText(value);

  if (!domainId || domainId === ALL_DOMAINS_ID || domainId === NO_DOMAIN_ID) {
    return null;
  }

  if (!get(`SELECT id FROM domains WHERE id = ?`, domainId)) {
    throw new Error("Domain not found.");
  }

  return domainId;
}

function nullableText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function fallbackTitle(filename) {
  if (!filename) {
    return "Untitled document";
  }

  return filename.replace(/\.[^.]+$/i, "").replaceAll(/[-_]+/g, " ").trim() || "Untitled document";
}

function mimeTypeForSource(sourceType) {
  return sourceType === "html" ? "text/html" : "text/markdown";
}

function safePdfFilename(filename) {
  const safeName = basename(filename).replaceAll(/[^a-zA-Z0-9._-]+/g, "-") || "uploaded.pdf";

  return extname(safeName).toLowerCase() === ".pdf" ? safeName : `${safeName}.pdf`;
}

function sha256Hex(input) {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

async function walkFiles(root, extension) {
  const files = [];
  const pending = [root];

  while (pending.length > 0) {
    const directory = pending.pop();
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        pending.push(path);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) {
        files.push(path);
      }
    }
  }

  return files;
}
