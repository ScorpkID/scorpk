import * as vscode from 'vscode';
import { ToolDef } from '../types';

const MAX_LINES = 200;

export const getDiagnosticsTool: ToolDef = {
  name: 'get_diagnostics',
  description:
    'Devuelve los errores y warnings que VS Code ya detectó (linter, compilador de TypeScript, etc.) en el ' +
    'workspace, sin necesidad de correr el compilador a mano por terminal. Si se da un path, se limita a ese ' +
    'archivo.',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Ruta relativa opcional para limitar a un archivo' } },
  },
  requiresApproval: false,
};

export async function getDiagnosticsHandler(args: Record<string, unknown>): Promise<string> {
  const relPath = args.path ? String(args.path) : undefined;

  let entries: [vscode.Uri, vscode.Diagnostic[]][];
  if (relPath) {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) throw new Error('No hay ninguna carpeta de workspace abierta.');
    const uri = vscode.Uri.joinPath(folder.uri, relPath.replace(/^[/\\]+/, ''));
    entries = [[uri, vscode.languages.getDiagnostics(uri)]];
  } else {
    entries = vscode.languages.getDiagnostics();
  }

  const lines: string[] = [];
  for (const [uri, diagnostics] of entries) {
    if (diagnostics.length === 0) continue;
    const path = vscode.workspace.asRelativePath(uri, false);
    for (const d of diagnostics) {
      const severity = severityLabel(d.severity);
      const source = d.source ? ` (${d.source})` : '';
      lines.push(`${path}:${d.range.start.line + 1}: [${severity}] ${d.message}${source}`);
    }
  }

  if (lines.length === 0) return relPath ? `Sin diagnósticos en ${relPath}.` : 'Sin diagnósticos en el workspace.';
  if (lines.length > MAX_LINES) {
    return lines.slice(0, MAX_LINES).join('\n') + `\n\n(Cortado a ${MAX_LINES} de ${lines.length} diagnósticos.)`;
  }
  return lines.join('\n');
}

function severityLabel(severity: vscode.DiagnosticSeverity): string {
  switch (severity) {
    case vscode.DiagnosticSeverity.Error:
      return 'error';
    case vscode.DiagnosticSeverity.Warning:
      return 'warning';
    case vscode.DiagnosticSeverity.Information:
      return 'info';
    default:
      return 'hint';
  }
}
