import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { ToolDef } from '../types';
import { LLMClient } from '../../providers/llmClient';

// No importamos ToolHandler de ./index acá para no crear un import
// circular (index.ts ya importa de este archivo) — es solo un alias de
// tipo, así que repetir la firma inline alcanza.
type ToolHandler = (args: Record<string, unknown>) => Promise<string>;

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

export const gitBranchTool: ToolDef = {
  name: 'git_branch',
  description:
    'Cambia a una rama de git, creándola desde HEAD si todavía no existe. Un solo tool para ambos casos — no ' +
    'hace falta saber de antemano si la rama ya existe.',
  parameters: {
    type: 'object',
    properties: { name: { type: 'string', description: 'Nombre de la rama' } },
    required: ['name'],
  },
  requiresApproval: true,
};

/** `runGit` no rechaza cuando git escribe a stderr con exit code != 0 (a
 * propósito, para que git_status/git_diff no traten eso como error) — así
 * que no sirve para decidir "existe o no" con un try/catch. Chequeamos la
 * existencia de la rama de forma explícita en vez de inferirla del error. */
function branchExists(name: string): Promise<boolean> {
  const cwd = getWorkspaceRoot();
  return new Promise((resolve) => {
    execFile('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`], { cwd }, (error) => resolve(!error));
  });
}

export async function gitBranchHandler(args: Record<string, unknown>): Promise<string> {
  const name = String(args.name ?? '').trim();
  if (!name) return 'Error: name no puede estar vacío.';
  const exists = await branchExists(name);
  // Deliberadamente NO usamos `checkout -B`, que resetea una rama existente
  // a HEAD — destructivo, no es lo que pidió el usuario.
  return runGit(exists ? ['checkout', name] : ['checkout', '-b', name]);
}

export const gitStashTool: ToolDef = {
  name: 'git_stash',
  description: 'Maneja el stash de git: "save" guarda los cambios sin comitear, "pop" reaplica el último, "list" los lista.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', description: "'save' | 'pop' | 'list'" },
      message: { type: 'string', description: 'Mensaje opcional para identificar el stash (solo con action=save)' },
    },
    required: ['action'],
  },
  requiresApproval: true,
};

export async function gitStashHandler(args: Record<string, unknown>): Promise<string> {
  const action = String(args.action ?? '');
  if (action === 'save') {
    const message = args.message ? String(args.message).trim() : '';
    return runGit(message ? ['stash', 'push', '-m', message] : ['stash', 'push']);
  }
  if (action === 'pop') return runGit(['stash', 'pop']);
  if (action === 'list') return runGit(['stash', 'list']);
  return `Error: action inválido "${action}". Usá 'save', 'pop' o 'list'.`;
}

export const generateCommitMessageTool: ToolDef = {
  name: 'generate_commit_message',
  description:
    'Sugiere un mensaje de commit (estilo Conventional Commits) a partir del diff actual. Solo devuelve el texto ' +
    'sugerido — no comitea nada, eso lo hace un git_commit aparte con el mensaje que el usuario confirme.',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Ruta relativa opcional para limitar el diff considerado' } },
  },
  requiresApproval: false,
};

const COMMIT_MESSAGE_MAX_DIFF_CHARS = 8000;

const COMMIT_MESSAGE_SYSTEM_PROMPT =
  'Generás mensajes de commit de git a partir de un diff, estilo Conventional Commits ' +
  '(tipo(alcance opcional): descripción corta en imperativo, ej. "fix(auth): validar token expirado"). ' +
  'Respondé ÚNICAMENTE con el mensaje de commit, en una sola línea (salvo que el cambio realmente amerite ' +
  'un cuerpo de commit más largo), sin comillas ni backticks ni explicación adicional.';

/** Fábrica, no un ToolHandler estático — necesita el client/model activos,
 * que no están disponibles en el registro estático de tools/index.ts. Se
 * inyecta por-run en ScorpkViewProvider.runChat (chat individual) y en
 * teamRuntime.runAgentTurn (una vez resuelto el client de ESE agente). */
export function buildGenerateCommitMessageHandler(client: LLMClient, model: string): ToolHandler {
  return async (args: Record<string, unknown>): Promise<string> => {
    const diff = await gitDiffHandler(args);
    if (!diff || diff === '(sin cambios)') return 'No hay cambios en el diff — nada para resumir en un mensaje de commit.';
    const truncated = diff.length > COMMIT_MESSAGE_MAX_DIFF_CHARS ? diff.slice(0, COMMIT_MESSAGE_MAX_DIFF_CHARS) + '\n…(recortado)' : diff;

    let message = '';
    for await (const ev of client.chat({
      model,
      system: COMMIT_MESSAGE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: truncated }],
    })) {
      if (ev.type === 'text-delta') message += ev.textDelta;
    }
    return message.trim() || 'No se pudo generar un mensaje — probá con git_diff y escribilo a mano.';
  };
}
