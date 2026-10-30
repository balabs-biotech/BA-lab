import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const tracker = await readFile(new URL("../batch-tracker/tracker.js", import.meta.url), "utf8");
const start = tracker.indexOf("async function saveQcCheckNow(");
const end = tracker.indexOf("\n\n/* ============================================================\n   ETAT DES ACTIONS BATCH", start);
assert.ok(start >= 0 && end > start, "QC save handler must be present");
const handler = tracker.slice(start, end);

async function runSessionFailure({ stale = false } = {}) {
  const messages = [];
  let currentRevision = 1;
  const context = {
    authStateRevision: 1,
    organizationId: "org-test",
    isCurrentWorkspaceRevision(revision, organizationId) {
      return revision === currentRevision && organizationId === "org-test";
    },
    batchQcList: {
      querySelector() {
        return { value: "pass" };
      }
    },
    CSS: { escape: (value) => value },
    supabaseClient: {
      auth: {
        async getSession() {
          if (stale) {
            currentRevision = 2;
            context.authStateRevision = 2;
          }
          throw new Error("Session provider unavailable");
        }
      }
    },
    showMessage(message, type) {
      messages.push({ message, type });
    }
  };

  await assert.doesNotReject(
    vm.runInNewContext(`${handler}; saveQcCheckNow("qc-1")`, context),
    "a failed session lookup must be handled by the QC save flow"
  );
  return messages;
}

const currentFailure = await runSessionFailure();
assert.equal(currentFailure.length, 1, "a current session lookup failure must produce one user-facing error");
assert.equal(currentFailure[0].type, "error");
assert.match(currentFailure[0].message, /Session provider unavailable/);

const staleFailure = await runSessionFailure({ stale: true });
assert.equal(staleFailure.length, 0,
  "a session lookup failure from an obsolete auth revision must not show feedback in the new workspace");

console.log("QC save session-error handling passed: current failures are reported and stale failures are discarded.");
