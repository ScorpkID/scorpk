import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { ToolDef } from '../types';

const MAX_BUFFER = 1024 * 1024;

function getWorkspaceRoot(): string {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    throw new Error('No hay ninguna carpeta de workspace abierta.');
  }
  return folders[0].uri.fsPath;
}

function runGit(args: string[]): Promise<string> {
  const cwd = getWorkspaceRoot();
  return new Promise<string>((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: MAX_BUFFER }, (error, stdout, stderr) => {
      if (error && !stdout && !stderr) {
        reject(new Error(error.message));
        return;
      }
      resolve((stdout || stderr || '(sin cambios)').trim());
    });
  });
}

export const gitStatusTool: ToolDef = {
  name: 'git_status',
  description: 'Muestra el estado de git (archivos modificados, nuevos, staged) del workspace.',
  parameters: { type: 'object', properties: {} },
  requiresApproval: false,
};

export async function gitStatusHandler(): Promise<string> {
  return runGit(['status', '--porcelain=v1', '-b']);
}

export const gitDiffTool: ToolDef = {
  name: 'git_diff',
  description: 'Muestra el diff de git. Si se da una ruta, limita el diff a ese archivo.',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Ruta relativa opcional para limitar el diff' } },
  },
  requiresApproval: false,
};

export async function gitDiffHandler(args: Record<string, unknown>): Promise<string> {
  const relPath = args.path ? String(args.path) : undefined;
  return runGit(relPath ? ['diff', '--', relPath] : ['diff']);
}
