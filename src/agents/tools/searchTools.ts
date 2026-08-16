import * as vscode from 'vscode';
import { ToolDef } from '../types';

const EXCLUDE_GLOB = '**/{node_modules,.git,dist,out,.next,build}/**';
const MAX_FILES_SCANNED = 500;
const MAX_FILE_SIZE = 1024 * 1024;
const MAX_MATCHES = 200;
const BINARY_MARKER = String.fromCharCode(0);

export const searchFilesTool: ToolDef = {
  name: 'search_files',
  description:
    'Busca un texto o expresión regular en el contenido de los archivos del workspace (como grep). Devuelve ' +
    'ruta:línea y el contenido de cada línea que matchea, agrupado por archivo. Preferí esta tool en vez de leer ' +
    'archivo por archivo con read_file cuando necesites encontrar dónde está algo en un repo grande.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Texto o expresión regular a buscar' },
      regex: { type: 'boolean', description: 'true si query es una expresión regular (default: false, texto literal)' },
      path: { type: 'string', description: 'Subcarpeta opcional donde limitar la búsqueda' },
      case_sensitive: { type: 'boolean', description: 'true para distinguir mayúsculas/minúsculas (default: false)' },
    },
    required: ['query'],
  },
  requiresApproval: false,
};

export async function searchFilesHandler(args: Record<string, unknown>): Promise<string> {
  const query = String(args.query ?? '');
  if (!query) return 'Error: query no puede estar vacío.';

  const isRegex = Boolean(args.regex);
  const caseSensitive = Boolean(args.case_sensitive);
  const subPath = args.path ? String(args.path).replace(/^[/\\]+/, '') : '';

  let pattern: RegExp;
  try {
    const source = isRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    pattern = new RegExp(source, caseSensitive ? 'g' : 'gi');
  } catch (err: any) {
    return `Error: expresión regular inválida (${err?.message ?? err}).`;
  }

  const include = subPath ? `${subPath.replace(/\/+$/, '')}/**/*` : '**/*';
  const uris = await vscode.workspace.findFiles(include, EXCLUDE_GLOB, MAX_FILES_SCANNED);

  const resultsByFile: string[] = [];
  let totalMatches = 0;
  let filesScanned = 0;
  let truncated = false;

  for (const uri of uris) {
    if (totalMatches >= MAX_MATCHES) {
      truncated = true;
      break;
    }
    let stat: vscode.FileStat;
    try {
      stat = await vscode.workspace.fs.stat(uri);
    } catch {
      continue;
    }
    if (stat.size > MAX_FILE_SIZE) continue;

    filesScanned++;
    let text: string;
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      text = Buffer.from(bytes).toString('utf8');
    } catch {
      continue;
    }
    if (text.includes(BINARY_MARKER)) continue;

    const relPath = vscode.workspace.asRelativePath(uri, false);
    const lines = text.split(/\r\n|\n/);
    const fileMatches: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      pattern.lastIndex = 0;
      if (pattern.test(lines[i])) {
        fileMatches.push(`${relPath}:${i + 1}: ${lines[i].trim().slice(0, 300)}`);
        totalMatches++;
        if (totalMatches >= MAX_MATCHES) {
          truncated = true;
          break;
        }
      }
    }
    if (fileMatches.length > 0) resultsByFile.push(fileMatches.join('\n'));
  }

  if (resultsByFile.length === 0) {
    return `Sin coincidencias para "${query}" (se escanearon ${filesScanned} archivo(s)).`;
  }
  let out = resultsByFile.join('\n\n');
  if (truncated) {
    out += `\n\n(Resultados cortados a ${MAX_MATCHES} coincidencias — afiná la búsqueda con "path" o un patrón más específico.)`;
  }
  return out;
}
