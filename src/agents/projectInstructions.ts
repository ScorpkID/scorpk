import * as vscode from 'vscode';

const INSTRUCTIONS_FILENAME = 'SCORPK.md';
const MAX_LENGTH = 8000;

/**
 * Lee SCORPK.md de la raíz del workspace, si existe, para sumarlo como
 * instrucciones fijas al prompt de todos los agentes (mismo espíritu que
 * CLAUDE.md/.cursorrules en otras herramientas).
 */
export async function readProjectInstructions(): Promise<string | undefined> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return undefined;
  try {
    const uri = vscode.Uri.joinPath(folder.uri, INSTRUCTIONS_FILENAME);
    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(bytes).toString('utf8').trim();
    if (!text) return undefined;
    return text.length > MAX_LENGTH ? text.slice(0, MAX_LENGTH) + '\n…(recortado)' : text;
  } catch {
    return undefined;
  }
}

export function withProjectInstructions(basePrompt: string, instructions: string | undefined): string {
  if (!instructions) return basePrompt;
  return `${basePrompt}\n\nInstrucciones específicas de este proyecto (de SCORPK.md):\n${instructions}`;
}
