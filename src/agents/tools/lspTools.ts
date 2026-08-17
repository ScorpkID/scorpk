import * as vscode from 'vscode';
import { ToolDef } from '../types';

function getWorkspaceRoot(): vscode.Uri {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    throw new Error('No hay ninguna carpeta de workspace abierta.');
  }
  return folders[0].uri;
}

async function findSymbolPosition(uri: vscode.Uri, symbol: string): Promise<{ doc: vscode.TextDocument; position: vscode.Position }> {
  const doc = await vscode.workspace.openTextDocument(uri);
  const text = doc.getText();
  const pattern = new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  const match = pattern.exec(text);
  if (!match) {
    throw new Error(`No se encontró "${symbol}" en el archivo.`);
  }
  return { doc, position: doc.positionAt(match.index) };
}

function formatLocations(locations: vscode.Location[]): string {
  if (locations.length === 0) return 'Sin resultados.';
  const lines = locations.map((loc) => {
    const path = vscode.workspace.asRelativePath(loc.uri, false);
    return `${path}:${loc.range.start.line + 1}`;
  });
  return lines.join('\n');
}

export const goToDefinitionTool: ToolDef = {
  name: 'go_to_definition',
  description:
    'Encuentra dónde está definido un símbolo (función, clase, variable) usando el analizador de lenguaje de ' +
    'VS Code (entiende el código, no busca texto). Se le da un archivo donde el símbolo aparece usado o ' +
    'definido, y el nombre del símbolo.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Ruta relativa a un archivo donde aparece el símbolo' },
      symbol: { type: 'string', description: 'Nombre del símbolo a buscar' },
    },
    required: ['path', 'symbol'],
  },
  requiresApproval: false,
};

export async function goToDefinitionHandler(args: Record<string, unknown>): Promise<string> {
  const relPath = String(args.path ?? '');
  const symbol = String(args.symbol ?? '');
  const uri = vscode.Uri.joinPath(getWorkspaceRoot(), relPath.replace(/^[/\\]+/, ''));
  const { position } = await findSymbolPosition(uri, symbol);
  const locations = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
    'vscode.executeDefinitionProvider',
    uri,
    position,
  );
  return formatLocations(normalizeLocations(locations));
}

export const findReferencesTool: ToolDef = {
  name: 'find_references',
  description:
    'Encuentra todos los lugares del proyecto donde se usa un símbolo (función, clase, variable), usando el ' +
    'analizador de lenguaje de VS Code — más preciso que buscar el texto porque entiende el código.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Ruta relativa a un archivo donde aparece el símbolo' },
      symbol: { type: 'string', description: 'Nombre del símbolo a buscar' },
    },
    required: ['path', 'symbol'],
  },
  requiresApproval: false,
};

export async function findReferencesHandler(args: Record<string, unknown>): Promise<string> {
  const relPath = String(args.path ?? '');
  const symbol = String(args.symbol ?? '');
  const uri = vscode.Uri.joinPath(getWorkspaceRoot(), relPath.replace(/^[/\\]+/, ''));
  const { position } = await findSymbolPosition(uri, symbol);
  const locations = await vscode.commands.executeCommand<vscode.Location[]>(
    'vscode.executeReferenceProvider',
    uri,
    position,
  );
  return formatLocations(locations ?? []);
}

function normalizeLocations(results: (vscode.Location | vscode.LocationLink)[] | undefined): vscode.Location[] {
  if (!results) return [];
  return results.map((r) => ('targetUri' in r ? new vscode.Location(r.targetUri, r.targetRange) : r));
}
