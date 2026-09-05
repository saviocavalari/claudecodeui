import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Read-only inventory of the operator's per-project env files.
 *
 * It reports which projects have secrets configured and which variable NAMES
 * each file declares — never the values. The admin panel uses it to answer
 * "is this project's credential set up?" without anyone opening a terminal,
 * and it stays admin-only because even the list of names is sensitive.
 */

/** Deepest directory level walked below the secrets root. */
const MAX_WALK_DEPTH = 6;

/** Matches `NAME=`, tolerating leading whitespace and a shell `export` prefix. */
const ENV_VARIABLE_PATTERN = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

export type ProjectSecretsFile = {
  file: string;
  relativePath: string;
  variables: string[];
};

export type ProjectSecretsInventory = {
  root: string;
  projects: Array<{ name: string; files: ProjectSecretsFile[] }>;
  totalFiles: number;
  totalVariables: number;
};

/** Absolute path of the folder holding the per-project env files. */
export function getProjectSecretsRoot(): string {
  return path.resolve(
    process.env.PROJECT_SECRETS_DIR || path.join(os.homedir(), '.secrets', 'projetos'),
  );
}

function collectEnvFiles(directory: string, depth = 0): string[] {
  if (depth > MAX_WALK_DEPTH) {
    return [];
  }

  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    // Symlinks are skipped so the walk can never leave the secrets root.
    if (entry.isSymbolicLink()) {
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...collectEnvFiles(entryPath, depth + 1));
    } else if (entry.isFile() && (entry.name.startsWith('.env') || entry.name.endsWith('.env'))) {
      files.push(entryPath);
    }
  }
  return files;
}

function readVariableNames(filePath: string): string[] {
  const contents = fs.readFileSync(filePath, 'utf8');
  const names = contents
    .split(/\r?\n/)
    .map((line) => ENV_VARIABLE_PATTERN.exec(line)?.[1] ?? null)
    .filter((name): name is string => Boolean(name));
  return [...new Set(names)].sort();
}

/** Lists every project env file with its variable names, grouped by project. */
export function readProjectSecretsInventory(): ProjectSecretsInventory {
  const secretsRoot = getProjectSecretsRoot();
  const empty: ProjectSecretsInventory = {
    root: '~/.secrets/projetos',
    projects: [],
    totalFiles: 0,
    totalVariables: 0,
  };

  if (!fs.existsSync(secretsRoot)) {
    return empty;
  }

  const files = collectEnvFiles(secretsRoot);
  const projects = new Map<string, ProjectSecretsFile[]>();
  let totalVariables = 0;

  for (const filePath of files) {
    const relativePath = path.relative(secretsRoot, filePath);
    const segments = relativePath.split(path.sep);
    // Files sitting directly in the root have no project folder to name them.
    const projectName = segments.length > 1
      ? segments.slice(0, -1).join(' / ')
      : segments[0].replace(/^\.env(?:\..*)?$/, 'Projeto geral');
    const variables = readVariableNames(filePath);
    totalVariables += variables.length;

    const projectFiles = projects.get(projectName) ?? [];
    projectFiles.push({
      file: segments[segments.length - 1],
      relativePath,
      variables,
    });
    projects.set(projectName, projectFiles);
  }

  return {
    root: '~/.secrets/projetos',
    projects: [...projects.entries()]
      .map(([name, projectFiles]) => ({
        name,
        files: projectFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    totalFiles: files.length,
    totalVariables,
  };
}
