import * as vscode from 'vscode';
import * as path from 'path';
import { diffLines } from 'diff';
import { ToolDef } from '../types';
import { animatedReplaceAll, animatedReplaceRange, notifyDelete } from './editorAnimation';

// Los ToolHandler son funciones (args) => Promise<string> sin canal propio
// para pasarles configuración (esa firma también la usan las tools de MCP),
// así que el toggle de "vista en vivo" de Ajustes se refleja acá con un
// setter simple en vez de rediseñar la interfaz de tools por un booleano.
let liveEditorPreviewEnabled = true;
export function setLiveEditorPreviewEnabled(enabled: boolean): void {
  liveEditorPreviewEnabled = enabled;
}

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
  await animatedReplaceAll(uri, content, liveEditorPreviewEnabled);
  return `Archivo escrito: ${relPath} (${content.length} caracteres)`;
}

export const editFileTool: ToolDef = {
  name: 'edit_file',
  description:
    'Reemplaza una porción puntual de un archivo existente (una sección, función, línea, etc.) sin reescribirlo ' +
    'entero. old_string tiene que aparecer exactamente una vez en el archivo — agregá líneas de contexto antes o ' +
    'después si hace falta para que sea único. new_string vacío borra esa porción. Para archivos nuevos o ' +
    'reescrituras completas de un archivo, usá write_file en vez de esta.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Ruta relativa al root del workspace' },
      old_string: { type: 'string', description: 'Texto exacto a reemplazar (debe aparecer una sola vez en el archivo)' },
      new_string: { type: 'string', description: 'Texto que lo reemplaza (vacío para borrar esa porción)' },
    },
    required: ['path', 'old_string', 'new_string'],
  },
  requiresApproval: true,
};

export async function editFileHandler(args: Record<string, unknown>): Promise<string> {
  const relPath = String(args.path ?? '');
  const oldString = String(args.old_string ?? '');
  const newString = String(args.new_string ?? '');
  if (!oldString) {
    return 'Error: old_string no puede estar vacío. Para crear contenido nuevo usá write_file.';
  }

  const uri = resolveInWorkspace(relPath);
  let doc: vscode.TextDocument;
  try {
    doc = await vscode.workspace.openTextDocument(uri);
  } catch {
    return `Error: no se encontró el archivo ${relPath}. Para crearlo usá write_file.`;
  }
  const current = doc.getText();
  const pattern = eolFlexiblePattern(oldString);
  const matches = current.match(pattern) ?? [];
  if (matches.length === 0) {
    return `Error: no se encontró ese texto en ${relPath}. Releé el archivo para confirmar el contenido exacto (espacios e indentación incluidos).`;
  }
  if (matches.length > 1) {
    return `Error: ese texto aparece ${matches.length} veces en ${relPath} — agregá más contexto (líneas antes/después) para que sea único.`;
  }

  pattern.lastIndex = 0;
  const match = pattern.exec(current)!;
  const startOffset = match.index;
  const matchedLength = match[0].length;
  const replacement = normalizeEol(newString, detectDominantEol(current));

  const range = new vscode.Range(doc.positionAt(startOffset), doc.positionAt(startOffset + matchedLength));
  await animatedReplaceRange(uri, range, replacement, liveEditorPreviewEnabled);
  return `Archivo editado: ${relPath}`;
}

export const moveFileTool: ToolDef = {
  name: 'move_file',
  description: 'Mueve o renombra un archivo dentro del workspace.',
  parameters: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'Ruta relativa actual del archivo' },
      to: { type: 'string', description: 'Ruta relativa destino' },
    },
    required: ['from', 'to'],
  },
  requiresApproval: true,
};

export async function moveFileHandler(args: Record<string, unknown>): Promise<string> {
  const from = String(args.from ?? '');
  const to = String(args.to ?? '');
  if (!from || !to) return 'Error: from y to son obligatorios.';
  const fromUri = resolveInWorkspace(from);
  const toUri = resolveInWorkspace(to);
  try {
    await vscode.workspace.fs.rename(fromUri, toUri, { overwrite: false });
  } catch (err: any) {
    return `Error: no se pudo mover ${from} a ${to} (${err?.message ?? err}).`;
  }
  return `Movido: ${from} → ${to}`;
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
  notifyDelete(relPath);
  return `Archivo eliminado: ${relPath}`;
}

/**
 * edit_file busca old_string tal cual lo mandó el modelo, pero los archivos
 * de este entorno suelen tener fin de línea CRLF (Windows) mientras que el
 * modelo casi siempre genera '\n' — con comparación exacta eso hacía fallar
 * la búsqueda siempre, aunque el texto fuera "el mismo". Esta regex permite
 * que cada salto de línea del patrón matchee tanto '\n' como '\r\n' reales.
 */
function eolFlexiblePattern(text: string): RegExp {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flexible = escaped.replace(/\n/g, '\\r?\\n');
  return new RegExp(flexible, 'g');
}

function detectDominantEol(text: string): '\r\n' | '\n' {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lfOnly = (text.match(/(?<!\r)\n/g) ?? []).length;
  return crlf > lfOnly ? '\r\n' : '\n';
}

function normalizeEol(text: string, eol: '\r\n' | '\n'): string {
  return text.replace(/\r\n|\n/g, eol);
}

export interface FileChange {
  path: string;
  kind: 'write' | 'edit' | 'delete' | 'move';
  existedBefore: boolean;
  before: string;
  after: string;
  diff: string;
  movedFrom?: string;
}

/**
 * Calcula el cambio de contenido de un write_file/edit_file/delete_file
 * antes de que se ejecute: contenido "antes" (leído del disco), "después"
 * (lo que va a quedar) y un diff en texto plano (líneas prefijadas con
 * +/-/espacio). Devuelve undefined si la tool no es de archivo, si no hay
 * path, o si no hay cambio real (o, para edit_file, si old_string no
 * aparece exactamente una vez — ahí el handler real es quien reporta el
 * error al modelo, esto es solo una preview best-effort). Es la única
 * lectura del estado "antes" — de acá salen tanto la tarjetita de diff del
 * chat como el checkpoint.
 */
export async function computeFileChange(name: string, args: Record<string, unknown>): Promise<FileChange | undefined> {
  if (name === 'move_file') return computeMoveChange(args);
  if (name !== 'write_file' && name !== 'edit_file' && name !== 'delete_file') return undefined;

  const relPath = String(args.path ?? '');
  if (!relPath) return undefined;

  let before = '';
  let existedBefore = true;
  try {
    const uri = resolveInWorkspace(relPath);
    const bytes = await vscode.workspace.fs.readFile(uri);
    before = Buffer.from(bytes).toString('utf8');
  } catch {
    before = '';
    existedBefore = false;
  }

  let after: string;
  if (name === 'write_file') {
    after = String(args.content ?? '');
  } else if (name === 'edit_file') {
    const oldString = String(args.old_string ?? '');
    const newString = String(args.new_string ?? '');
    if (!oldString) return undefined;
    const pattern = eolFlexiblePattern(oldString);
    const matches = before.match(pattern) ?? [];
    if (matches.length !== 1) return undefined;
    pattern.lastIndex = 0;
    const match = pattern.exec(before)!;
    const replacement = normalizeEol(newString, detectDominantEol(before));
    after = before.slice(0, match.index) + replacement + before.slice(match.index + match[0].length);
  } else {
    after = '';
  }
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
  return {
    path: relPath,
    kind: name === 'write_file' ? 'write' : name === 'edit_file' ? 'edit' : 'delete',
    existedBefore,
    before,
    after,
    diff: lines.join('\n'),
  };
}

async function computeMoveChange(args: Record<string, unknown>): Promise<FileChange | undefined> {
  const from = String(args.from ?? '');
  const to = String(args.to ?? '');
  if (!from || !to) return undefined;

  let before = '';
  try {
    const uri = resolveInWorkspace(from);
    const bytes = await vscode.workspace.fs.readFile(uri);
    before = Buffer.from(bytes).toString('utf8');
  } catch {
    return undefined;
  }

  return {
    path: to,
    kind: 'move',
    existedBefore: false,
    before,
    after: before,
    diff: `Mover: ${from} → ${to}`,
    movedFrom: from,
  };
}

/** Compatibilidad: solo el string de diff, para quien no necesita before/after. */
export async function buildToolCallDiff(name: string, args: Record<string, unknown>): Promise<string | undefined> {
  return (await computeFileChange(name, args))?.diff;
}
