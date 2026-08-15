import * as vscode from 'vscode';
import * as path from 'path';
import { diffLines } from 'diff';
import { ToolDef } from '../types';

function resolveInWorkspace(relativePath: string): vscode.Uri {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    throw new Error('No hay ninguna carpeta de workspace abierta.');
  }
  const root = folders[0].uri;
  const normalized = relativePath.replace(/^[/\\]+/, '');
  const resolved = path.join(root.fsPath, normalized);
  const relative = path.relative(root.fsPath, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Ruta fuera del workspace: ${relativePath}`);
  }
  return vscode.Uri.file(resolved);
}

export const readFileTool: ToolDef = {
  name: 'read_file',
  description: 'Lee el contenido de un archivo de texto del workspace actual, dada una ruta relativa.',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Ruta relativa al root del workspace' } },
    required: ['path'],
  },
  requiresApproval: false,
};

export async function readFileHandler(args: Record<string, unknown>): Promise<string> {
  const relPath = String(args.path ?? '');
  const uri = resolveInWorkspace(relPath);
  const bytes = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(bytes).toString('utf8');
}

export const listDirTool: ToolDef = {
  name: 'list_dir',
  description: 'Lista archivos y carpetas dentro de una ruta relativa del workspace.',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Ruta relativa al root del workspace ("." para la raíz)' } },
    required: ['path'],
  },
  requiresApproval: false,
};

export async function listDirHandler(args: Record<string, unknown>): Promise<string> {
  const relPath = String(args.path ?? '.');
  const uri = resolveInWorkspace(relPath);
  const entries = await vscode.workspace.fs.readDirectory(uri);
  return entries
    .map(([name, type]) => `${type === vscode.FileType.Directory ? 'DIR ' : 'FILE'}  ${name}`)
    .join('\n');
}

export const writeFileTool: ToolDef = {
  name: 'write_file',
  description: 'Crea o sobrescribe un archivo de texto en el workspace con el contenido dado.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Ruta relativa al root del workspace' },
      content: { type: 'string', description: 'Contenido completo a escribir en el archivo' },
    },
    required: ['path', 'content'],
  },
  requiresApproval: true,
};

export async function writeFileHandler(args: Record<string, unknown>): Promise<string> {
  const relPath = String(args.path ?? '');
  const content = String(args.content ?? '');
  const uri = resolveInWorkspace(relPath);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
  return `Archivo escrito: ${relPath} (${content.length} caracteres)`;
}

export const deleteFileTool: ToolDef = {
  name: 'delete_file',
  description: 'Elimina un archivo del workspace, dada una ruta relativa.',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Ruta relativa al root del workspace' } },
    required: ['path'],
  },
  requiresApproval: true,
};

export async function deleteFileHandler(args: Record<string, unknown>): Promise<string> {
  const relPath = String(args.path ?? '');
  const uri = resolveInWorkspace(relPath);
  await vscode.workspace.fs.delete(uri, { useTrash: true });
  return `Archivo eliminado: ${relPath}`;
}

/**
 * Diff en texto plano (líneas prefijadas con +/-/espacio) para mostrar antes
 * de aprobar un write_file o delete_file. Devuelve undefined si la tool no
 * es de archivo o si no se pudo leer el estado actual por algún motivo.
 */
export async function buildToolCallDiff(name: string, args: Record<string, unknown>): Promise<string | undefined> {
  if (name !== 'write_file' && name !== 'delete_file') return undefined;

  const relPath = String(args.path ?? '');
  if (!relPath) return undefined;

  let before = '';
  try {
    const uri = resolveInWorkspace(relPath);
    const bytes = await vscode.workspace.fs.readFile(uri);
    before = Buffer.from(bytes).toString('utf8');
  } catch {
    before = '';
  }

  const after = name === 'write_file' ? String(args.content ?? '') : '';
  if (before === after) return undefined;

  const parts = diffLines(before, after);
  const lines: string[] = [];
  for (const part of parts) {
    const prefix = part.added ? '+' : part.removed ? '-' : ' ';
    const partLines = part.value.replace(/\n$/, '').split('\n');
    for (const line of partLines) {
      lines.push(prefix + ' ' + line);
    }
  }
  return lines.join('\n');
}
