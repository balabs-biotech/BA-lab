import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";

export const LEGAL_DOCUMENTS = Object.freeze([
  Object.freeze({ documentType: "terms", filePath: "legal/terms.html" }),
  Object.freeze({ documentType: "privacy_notice", filePath: "legal/privacy.html" }),
  Object.freeze({ documentType: "cookies_notice", filePath: "legal/cookies.html" }),
]);

const ALLOWED_PATHS = new Map(LEGAL_DOCUMENTS.map(({ documentType, filePath }) => [documentType, filePath]));
const REVIEW_PATTERNS = [
  { code: "draft_version", pattern: /version\s+de\s+travail/i, message: "The page is explicitly marked as a working draft." },
  { code: "review_notice", pattern: /(?:document\s+à\s+valider|à\s+finaliser\s+avant|doit\s+être\s+(?:complété|complétée|finalisé|finalisée)|must\s+be\s+(?:completed|reviewed))/i, message: "The page still contains a legal review or completion notice." },
  { code: "placeholder", pattern: /\[[^\]]*(?:à\s+compléter|a\s+completer|adresse|dénomination|denomination|siège|siege|immatriculation|nom\s+et\s+fonction|contact|e-?mail|rc\s*\/|nif|nis)[^\]]*\]/i, message: "The page contains an unresolved bracketed placeholder." },
  { code: "template_token", pattern: /\{\{[^}]+\}\}|\b(?:TODO|FIXME|TBD)\b/i, message: "The page contains an unresolved template token." },
  { code: "internal_draft_language", pattern: /champs\s+entre\s+crochets|version\s+provisoire|document\s+de\s+travail/i, message: "The page contains internal draft wording." },
];

function assertAllowedDocument(documentType, filePath) {
  if (!ALLOWED_PATHS.has(documentType)) throw new Error("document_type_not_allowed");
  if (ALLOWED_PATHS.get(documentType) !== filePath) throw new Error("path_not_allowed");
}

export function inspectLegalDocument({ documentType, filePath, content }) {
  assertAllowedDocument(documentType, filePath);
  if (typeof content !== "string") throw new TypeError("content_must_be_utf8_text");

  const bytes = Buffer.from(content, "utf8");
  const blockers = REVIEW_PATTERNS
    .filter(({ pattern }) => pattern.test(content))
    .map(({ code, message }) => ({ code, message }));

  if (!content.trim()) blockers.push({ code: "empty_document", message: "The document is empty." });
  if (!/<html\b/i.test(content) || !/<\/html\s*>/i.test(content)) {
    blockers.push({ code: "invalid_html_shell", message: "The document does not contain a complete HTML shell." });
  }

  return Object.freeze({
    documentType,
    filePath,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    ready: blockers.length === 0,
    blockers,
  });
}

export async function buildPreflightReport(rootDirectory = process.cwd()) {
  const documents = [];
  for (const item of LEGAL_DOCUMENTS) {
    const absolutePath = path.resolve(rootDirectory, item.filePath);
    const raw = await fs.readFile(absolutePath);
    let content;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(raw);
    } catch {
      throw new Error(`invalid_utf8_document:${item.filePath}`);
    }
    const inspected = inspectLegalDocument({ ...item, content });
    // Hash the exact bytes read from disk, not a normalized or rewritten HTML string.
    documents.push(Object.freeze({
      ...inspected,
      bytes: raw.byteLength,
      sha256: createHash("sha256").update(raw).digest("hex"),
    }));
  }

  return Object.freeze({
    ready: documents.every((document) => document.ready),
    documents,
  });
}
