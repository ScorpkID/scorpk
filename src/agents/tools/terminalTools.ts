import * as vscode from 'vscode';
import { exec } from 'child_process';
import { ToolDef } from '../types';

const TIMEOUT_MS = 60_000;
const MAX_BUFFER = 1024 * 1024;

export const runTerminalCommandTool: ToolDef = {
  name: 'run_terminal_command',
  description: 'Ejecuta un comando de shell en la raíz del workspace actual y devuelve stdout/stderr.',
  parameters: {
    type: 'object',
    properties: { command: { type: 'string', description: 'Comando de shell a ejecutar' } },
    required: ['command'],
  },
  requiresApproval: true,
};

export async function runTerminalCommandHandler(args: Record<string, unknown>): Promise<string> {
  const command = String(args.command ?? '');
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    throw new Error('No hay ninguna carpeta de workspace abierta.');
  }
  const cwd = folders[0].uri.fsPath;

  return new Promise<string>((resolve, reject) => {
    exec(command, { cwd, timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER }, (error, stdout, stderr) => {
      const output = [stdout?.trim(), stderr?.trim()].filter(Boolean).join('\n');
      if (error && !output) {
        reject(new Error(error.message));
        return;
      }
      const exitInfo = error ? `\n[exit code: ${(error as any).code ?? 'error'}]` : '';
      resolve((output || '(sin salida)') + exitInfo);
    });
  });
}
