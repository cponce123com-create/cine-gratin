/**
 * Validates the GitHub Actions workflows.
 *
 * A malformed workflow is only detected when it runs, so it is checked in the
 * pipeline: every file must be valid YAML and must define the expected jobs.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowsDir = path.join(root, ".github", "workflows");

const EXPECTED_JOBS = {
  "ci.yml": ["quality", "test", "build", "deploy"],
};

const failures = [];

const files = readdirSync(workflowsDir).filter((file) => file.endsWith(".yml"));

if (files.length === 0) {
  failures.push("No hay workflows en .github/workflows");
}

for (const file of files) {
  const content = readFileSync(path.join(workflowsDir, file), "utf8");

  let workflow;
  try {
    workflow = parse(content);
  } catch (err) {
    failures.push(`${file}: YAML inválido — ${err.message}`);
    continue;
  }

  if (!workflow || typeof workflow !== "object") {
    failures.push(`${file}: el contenido no es un objeto`);
    continue;
  }

  if (!workflow.jobs || typeof workflow.jobs !== "object") {
    failures.push(`${file}: no define jobs`);
    continue;
  }

  const expected = EXPECTED_JOBS[file];
  if (expected) {
    for (const job of expected) {
      if (!workflow.jobs[job]) failures.push(`${file}: falta el job "${job}"`);
    }
  }

  // The deploy must depend on the verification jobs.
  const deploy = workflow.jobs?.deploy;
  if (deploy) {
    const needs = Array.isArray(deploy.needs) ? deploy.needs : deploy.needs ? [deploy.needs] : [];
    for (const job of ["quality", "test", "build"]) {
      if (!needs.includes(job)) failures.push(`${file}: el job "deploy" no depende de "${job}"`);
    }
  }

  // The secrets must never be interpolated inside a shell command.
  if (/run:[\s\S]{0,400}\$\{\{\s*secrets\./.test(content)) {
    failures.push(`${file}: un secret se interpola dentro de un comando (pasa por env)`);
  }
}

if (failures.length > 0) {
  console.error("Workflows inválidos:\n" + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}

console.log(`Workflows válidos: ${files.join(", ")}`);
