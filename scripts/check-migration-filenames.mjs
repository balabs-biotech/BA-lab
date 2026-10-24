import { readdir } from "node:fs/promises";
import path from "node:path";

const directory = path.resolve("supabase/migrations");
const entries = (await readdir(directory))
  .filter((name) => name.endsWith(".sql"))
  .sort();

const seen = new Map();
const errors = [];

for (const name of entries) {
  const match = name.match(/^(\d{14})_([a-z0-9][a-z0-9_]*)\.sql$/);
  if (!match) {
    errors.push(`Invalid migration filename: ${name}`);
    continue;
  }

  const [, version] = match;
  if (seen.has(version)) {
    errors.push(`Duplicate migration version ${version}: ${seen.get(version)} and ${name}`);
  } else {
    seen.set(version, name);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Migration filenames valid: ${entries.length} files, ${seen.size} unique versions.`);
}
