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

export const gitAddTool: ToolDef = {
  name: 'git_add',
  description: 'Agrega archivos al staging area de git. Si no se especifican paths, hace stage de todos los cambios.',
  parameters: {
    type: 'object',
    properties: {
      paths: { type: 'array', items: { type: 'string' }, description: 'Rutas relativas a agregar (vacío = todo)' },
    },
  },
  requiresApproval: true,
};

export async function gitAddHandler(args: Record<string, unknown>): Promise<string> {
  const paths = Array.isArray(args.paths) ? args.paths.map(String).filter(Boolean) : [];
  await runGit(paths.length > 0 ? ['add', '--', ...paths] : ['add', '-A']);
  return paths.length > 0 ? `Agregado al staging: ${paths.join(', ')}` : 'Todos los cambios agregados al staging.';
}

export const gitCommitTool: ToolDef = {
  name: 'git_commit',
  description:
    'Crea un commit de git con los cambios en staging. Opcionalmente hace stage de rutas específicas antes de ' +
    'comitear (equivalente a llamar git_add primero).',
  parameters: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Mensaje del commit' },
      paths: { type: 'array', items: { type: 'string' }, description: 'Rutas relativas a agregar antes de comitear (opcional)' },
    },
    required: ['message'],
  },
  requiresApproval: true,
};

export async function gitCommitHandler(args: Record<string, unknown>): Promise<string> {
  const message = String(args.message ?? '').trim();
  if (!message) return 'Error: message no puede estar vacío.';
  const paths = Array.isArray(args.paths) ? args.paths.map(String).filter(Boolean) : [];
  if (paths.length > 0) {
    await runGit(['add', '--', ...paths]);
  }
  return runGit(['commit', '-m', message]);
}
