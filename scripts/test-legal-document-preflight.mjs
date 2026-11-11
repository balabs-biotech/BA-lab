import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { inspectLegalDocument, buildPreflightReport } from "./lib/legal-document-preflight.mjs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("blocks a draft legal document containing placeholders and review notices", () => {
  const content = `<!doctype html><html><body>
    <p>Version de travail — mise à jour : 11 novembre 2026</p>
    <div class="notice">À finaliser avant toute ouverture publique.</div>
    <p>Contact : [adresse électronique de BA Labs]</p>
  </body></html>`;
  const result = inspectLegalDocument({ documentType: "privacy_notice", filePath: "legal/privacy.html", content });
  assert.equal(result.ready, false);
  assert.ok(result.blockers.some((item) => item.code === "draft_version"));
  assert.ok(result.blockers.some((item) => item.code === "review_notice"));
  assert.ok(result.blockers.some((item) => item.code === "placeholder"));
});

test("accepts a clean document and hashes the exact UTF-8 bytes", () => {
  const content = "<!doctype html><html lang=\"fr\"><body>Conditions finalisées.</body></html>\n";
  const result = inspectLegalDocument({ documentType: "terms", filePath: "legal/terms.html", content });
  assert.equal(result.ready, true);
  assert.equal(result.sha256, createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex"));
  assert.equal(result.bytes, Buffer.byteLength(content, "utf8"));
});

test("rejects unsupported document types and mismatched paths", () => {
  assert.throws(() => inspectLegalDocument({ documentType: "terms", filePath: "legal/privacy.html", content: "<p>ok</p>" }), /path_not_allowed/);
  assert.throws(() => inspectLegalDocument({ documentType: "other", filePath: "legal/other.html", content: "<p>ok</p>" }), /document_type_not_allowed/);
});

test("builds a read-only report for the three legal documents", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ba-legal-preflight-"));
  try {
    await fs.mkdir(path.join(root, "legal"));
    await fs.writeFile(path.join(root, "legal/terms.html"), "<p>Version de travail</p>");
    await fs.writeFile(path.join(root, "legal/privacy.html"), "<p>Version de travail</p>");
    await fs.writeFile(path.join(root, "legal/cookies.html"), "<p>Version de travail</p>");
    const report = await buildPreflightReport(root);
    assert.deepEqual(report.documents.map((item) => item.documentType), ["terms", "privacy_notice", "cookies_notice"]);
    assert.equal(report.ready, false);
    assert.equal(report.documents.length, 3);
    assert.ok(report.documents.every((item) => /^[a-f0-9]{64}$/.test(item.sha256)));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
