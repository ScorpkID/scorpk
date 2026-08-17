import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';

const SKILLS_SUBDIR = '.scorpk/skills';
const MAX_BODY_LENGTH = 12000;

export type SkillScope = 'project' | 'personal';

export interface SkillSummary {
  name: string;
  description: string;
  scope: SkillScope;
  /** Ruta absoluta al SKILL.md, para poder abrirlo en el editor. */
  path: string;
}

interface ParsedSkillFile {
  name: string;
  description: string;
  body: string;
}

function parseSkillFile(text: string, fallbackName: string): ParsedSkillFile | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) return undefined;
  const frontmatter = match[1];
  const body = match[2].trim();

  let name = fallbackName;
  let description = '';
  for (const line of frontmatter.split(/\r?\n/)) {
    const kv = /^(\w[\w-]*)\s*:\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    const value = kv[2].trim();
    if (key === 'name' && value) name = value;
    else if (key === 'description') description = value;
  }
  if (!description) return undefined;
  return { name, description, body };
}

function personalSkillsRoot(): vscode.Uri {
  return vscode.Uri.file(path.join(os.homedir(), '.scorpk', 'skills'));
}

function projectSkillsRoot(): vscode.Uri | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return undefined;
  return vscode.Uri.joinPath(folder.uri, SKILLS_SUBDIR);
}

async function scanSkillsDir(root: vscode.Uri, scope: SkillScope): Promise<SkillSummary[]> {
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(root);
  } catch {
    return [];
  }

  const results: SkillSummary[] = [];
  for (const [entryName, type] of entries) {
    if (type !== vscode.FileType.Directory) continue;
    const skillUri = vscode.Uri.joinPath(root, entryName, 'SKILL.md');
    try {
      const bytes = await vscode.workspace.fs.readFile(skillUri);
      const parsed = parseSkillFile(Buffer.from(bytes).toString('utf8'), entryName);
      if (parsed) results.push({ name: parsed.name, description: parsed.description, scope, path: skillUri.fsPath });
    } catch {
      continue;
    }
  }
  return results;
}

/** Skills de proyecto y personales, de mayor a menor prioridad en caso de
 * nombre repetido (proyecto gana). Solo lee el frontmatter — el body se
 * carga recién cuando el modelo invoca use_skill. */
export async function listSkills(): Promise<SkillSummary[]> {
  const projectRoot = projectSkillsRoot();
  const [projectSkills, personalSkills] = await Promise.all([
    projectRoot ? scanSkillsDir(projectRoot, 'project') : Promise.resolve([]),
    scanSkillsDir(personalSkillsRoot(), 'personal'),
  ]);
  const seen = new Set(projectSkills.map((s) => s.name));
  return [...projectSkills, ...personalSkills.filter((s) => !seen.has(s.name))];
}

export async function loadSkillBody(name: string): Promise<string | undefined> {
  const skills = await listSkills();
  const match = skills.find((s) => s.name === name);
  if (!match) return undefined;
  const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(match.path));
  const parsed = parseSkillFile(Buffer.from(bytes).toString('utf8'), match.name);
  if (!parsed) return undefined;
  return parsed.body.length > MAX_BODY_LENGTH ? parsed.body.slice(0, MAX_BODY_LENGTH) + '\n…(recortado)' : parsed.body;
}

export function withSkillsPrompt(basePrompt: string, skills: SkillSummary[]): string {
  if (skills.length === 0) return basePrompt;
  const list = skills.map((s) => `- ${s.name}: ${s.description}`).join('\n');
  return (
    `${basePrompt}\n\nSkills disponibles (usá la tool "use_skill" con el nombre exacto para cargar sus ` +
    `instrucciones completas cuando la tarea del usuario calce con la descripción — no las listes en tu ` +
    `respuesta, es información interna):\n${list}`
  );
}

const SKILL_TEMPLATE = (name: string) => `---
name: ${name}
description: Describí en una línea cuándo conviene usar esta skill (el modelo decide con esto solo).
---

Instrucciones completas de la skill acá. Esto es lo único que se carga cuando
el modelo invoca use_skill — podés ser tan detallado como haga falta.
`;

/** Crea .scorpk/skills/<name>/SKILL.md (o el equivalente en ~/.scorpk/skills/)
 * con una plantilla mínima si todavía no existe, y devuelve su URI para
 * abrirla en el editor. */
export async function scaffoldSkill(name: string, scope: SkillScope): Promise<vscode.Uri> {
  const root = scope === 'project' ? projectSkillsRoot() : personalSkillsRoot();
  if (!root) throw new Error('No hay ninguna carpeta de workspace abierta.');
  const skillUri = vscode.Uri.joinPath(root, name, 'SKILL.md');
  try {
    await vscode.workspace.fs.stat(skillUri);
  } catch {
    await vscode.workspace.fs.writeFile(skillUri, Buffer.from(SKILL_TEMPLATE(name), 'utf8'));
  }
  return skillUri;
}
