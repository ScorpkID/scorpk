import * as vscode from 'vscode';
import { exec } from 'child_process';
import { ToolDef } from '../types';

const TIMEOUT_MS = 120_000;
const MAX_BUFFER = 1024 * 1024;
const MAX_RESULT_CHARS = 8000;
const MAX_FAILURE_BLOCKS = 3;
const FAILURE_BLOCK_LINES = 15;

export const runTestsTool: ToolDef = {
  name: 'run_tests',
  description:
    'Detecta el test runner del proyecto (npm test, pytest, go test, cargo test) y lo corre, devolviendo un ' +
    'resumen pass/fail con los primeros fallos en vez del output crudo completo. Pasá "command" para forzar un ' +
    'comando distinto si la detección automática no aplica o querés correr un subconjunto de tests.',
  parameters: {
    type: 'object',
    properties: { command: { type: 'string', description: 'Comando de test a forzar en vez del detectado automáticamente' } },
  },
  requiresApproval: true,
};

export const TEST_GUIDANCE =
  'Si editaste código que tiene tests relacionados, corré run_tests antes de dar la tarea por terminada — no ' +
  'asumas que tu cambio funciona sin haberlo corrido. Si no hay tests o no se detecta un runner, seguí adelante ' +
  'sin insistir.';

export async function runTestsHandler(args: Record<string, unknown>): Promise<string> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    throw new Error('No hay ninguna carpeta de workspace abierta.');
  }
  const cwd = folders[0].uri.fsPath;

  const override = args.command ? String(args.command).trim() : '';
  const command = override || (await detectTestCommand(cwd));
  if (!command) {
    return (
      'No se pudo detectar un test runner (package.json con script "test", pytest.ini/pyproject.toml/setup.cfg, ' +
      'go.mod, Cargo.toml). Pasá un comando explícito en el parámetro "command" si el proyecto usa otro.'
    );
  }

  const output = await execCommand(command, cwd);
  return summarizeTestOutput(output, command);
}

async function detectTestCommand(cwd: string): Promise<string | undefined> {
  const root = vscode.Uri.file(cwd);

  try {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root, 'package.json'));
    const pkg = JSON.parse(Buffer.from(bytes).toString('utf8'));
    const testScript = pkg?.scripts?.test;
    if (typeof testScript === 'string' && testScript.trim() && !/echo\s+.*no test specified/i.test(testScript)) {
      return 'npm test';
    }
  } catch {
    // sin package.json, o no parsea — seguimos con los demás marcadores
  }

  if (await fileExists(root, 'pytest.ini')) return 'pytest -q --tb=short';
  if (await fileContains(root, 'setup.cfg', 'pytest')) return 'pytest -q --tb=short';
  if (await fileContains(root, 'pyproject.toml', 'pytest')) return 'pytest -q --tb=short';
  if (await fileExists(root, 'go.mod')) return 'go test ./...';
  if (await fileExists(root, 'Cargo.toml')) return 'cargo test';

  return undefined;
}

async function fileExists(root: vscode.Uri, name: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.joinPath(root, name));
    return true;
  } catch {
    return false;
  }
}

async function fileContains(root: vscode.Uri, name: string, needle: string): Promise<boolean> {
  try {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root, name));
    return Buffer.from(bytes).toString('utf8').toLowerCase().includes(needle.toLowerCase());
  } catch {
    return false;
  }
}

function execCommand(command: string, cwd: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    exec(command, { cwd, timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER }, (error, stdout, stderr) => {
      const output = [stdout, stderr].filter(Boolean).join('\n');
      if (error && !output) {
        reject(new Error(error.message));
        return;
      }
      resolve(output || '(sin salida)');
    });
  });
}

interface TestSummary {
  failed: number;
  text: string;
}

function extractSummary(output: string): TestSummary | undefined {
  // Jest / Vitest: "Tests:       2 failed, 8 passed, 10 total"
  let m = /Tests:\s*(?:(\d+)\s+failed,\s*)?(?:(\d+)\s+passed,\s*)?(\d+)\s+total/i.exec(output);
  if (m) {
    const failed = Number(m[1] ?? 0);
    const passed = Number(m[2] ?? 0);
    return { failed, text: `${passed} passed, ${failed} failed (${m[3]} total)` };
  }

  // Mocha: "10 passing" / "2 failing" (líneas separadas)
  const passingM = /(\d+)\s+passing/i.exec(output);
  const failingM = /(\d+)\s+failing/i.exec(output);
  if (passingM || failingM) {
    const passed = passingM ? Number(passingM[1]) : 0;
    const failed = failingM ? Number(failingM[1]) : 0;
    return { failed, text: `${passed} passing, ${failed} failing` };
  }

  // pytest: "= 3 failed, 7 passed in 1.23s ="
  m = /=+\s*(?:(\d+)\s+failed,?\s*)?(?:(\d+)\s+passed,?\s*)?(?:(\d+)\s+skipped,?\s*)?(?:\d+\s+error[s]?,?\s*)?in\s+[\d.]+s\s*=+/i.exec(
    output,
  );
  if (m) {
    const failed = Number(m[1] ?? 0);
    const passed = Number(m[2] ?? 0);
    const skipped = Number(m[3] ?? 0);
    return { failed, text: `${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}` };
  }

  // cargo test: "test result: FAILED. 3 passed; 2 failed; ..."
  m = /test result:\s*(?:ok|FAILED)\.\s*(\d+)\s+passed;\s*(\d+)\s+failed/i.exec(output);
  if (m) {
    return { failed: Number(m[2]), text: `${m[1]} passed, ${m[2]} failed` };
  }

  // go test: cuento líneas --- FAIL:/--- PASS:
  const goFail = (output.match(/^--- FAIL:/gm) ?? []).length;
  const goPass = (output.match(/^--- PASS:/gm) ?? []).length;
  if (goFail > 0 || goPass > 0 || /^(ok|FAIL)\s+\S+/m.test(output)) {
    return { failed: goFail, text: `${goPass} passed, ${goFail} failed` };
  }

  return undefined;
}

const FAILURE_LINE_MARKERS = [
  /^\s*(●|✕|×)\s/, // jest/vitest
  /^\s*\d+\)\s/, // mocha, test numerado que falló
  /^FAILED\s/, // pytest, resumen corto
  /^_{5,}/, // pytest, separador de sección de fallo
  /^--- FAIL:/, // go test
  /^thread '.*' panicked/, // rust
];

function extractFailureExcerpts(output: string): string {
  const lines = output.split('\n');
  const blocks: string[] = [];
  for (let i = 0; i < lines.length && blocks.length < MAX_FAILURE_BLOCKS; i++) {
    if (FAILURE_LINE_MARKERS.some((re) => re.test(lines[i]))) {
      blocks.push(lines.slice(i, i + FAILURE_BLOCK_LINES).join('\n'));
    }
  }
  return blocks.join('\n---\n');
}

function summarizeTestOutput(output: string, command: string): string {
  const summary = extractSummary(output);
  if (!summary) {
    const truncated =
      output.length > MAX_RESULT_CHARS
        ? output.slice(0, MAX_RESULT_CHARS / 2) + '\n…(recortado)…\n' + output.slice(-MAX_RESULT_CHARS / 2)
        : output;
    return `Comando: ${command}\n\n${truncated}`;
  }

  const header = `Comando: ${command}\nResumen: ${summary.text}`;
  if (!summary.failed) return header;

  const excerpts = extractFailureExcerpts(output) || output;
  const capped = excerpts.length > MAX_RESULT_CHARS ? excerpts.slice(0, MAX_RESULT_CHARS) + '\n…(recortado)' : excerpts;
  return `${header}\n\n${capped}`;
}
