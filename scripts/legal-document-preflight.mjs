#!/usr/bin/env node
import { buildPreflightReport } from "./lib/legal-document-preflight.mjs";

const rootDirectory = process.argv[2] ?? process.cwd();

try {
  const report = await buildPreflightReport(rootDirectory);
  console.log("BA Labs — Legal document publication preflight");
  console.log(report.ready ? "RESULT: READY FOR LEGAL REVIEW" : "RESULT: BLOCKED — draft content remains");
  for (const document of report.documents) {
    console.log(`\n[${document.ready ? "READY" : "BLOCKED"}] ${document.documentType} — ${document.filePath}`);
    console.log(`  SHA-256: ${document.sha256}`);
    console.log(`  Bytes:   ${document.bytes}`);
    for (const blocker of document.blockers) console.log(`  BLOCKER ${blocker.code}: ${blocker.message}`);
  }
  if (!report.ready) process.exitCode = 1;
} catch (error) {
  console.error(`PREFLIGHT ERROR: ${error.message}`);
  process.exitCode = 2;
}
