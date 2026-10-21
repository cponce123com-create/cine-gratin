/**
 * Pre-commit hook.
 *
 * It formats the staged files and runs the type check before allowing the
 * commit. It replaces lint-staged (whose dependency chain pulled a package
 * without an available security fix) with a small script that only uses the
 * tools already in the project.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
}

function stagedFiles() {
  try {
    const output = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], {
      cwd: root,
      encoding: "utf8",
    });
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((file) => existsSync(path.join(root, file)));
  } catch {
    return [];
  }
}

const files = stagedFiles();
const formattable = files.filter((file) => /\.(ts|tsx|css|json|md|ya?ml)$/.test(file));

if (formattable.length > 0) {
  console.log(`Formateando ${formattable.length} fichero(s)…`);
  run("npx", ["--no-install", "prettier", "--write", ...formattable]);
  run("git", ["add", ...formattable]);
}

console.log("Comprobando los tipos…");
run("npx", ["--no-install", "tsc", "-p", "tsconfig.json", "--noEmit"]);

const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
if (!pkg.lintStaged) {
  // Nothing else to do: the type check and the format are the gate.
}

console.log("✓ comprobaciones superadas");
