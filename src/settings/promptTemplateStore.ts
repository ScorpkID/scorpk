import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { PromptTemplate } from '../shared/protocol';

const STORE_KEY = 'scorpk.promptTemplates';

const DEFAULT_TEMPLATES: Array<Omit<PromptTemplate, 'id'>> = [
  {
    trigger: 'test',
    label: '/test',
    expansion: 'Escribí tests para el código relevante a esta conversación, cubriendo los casos límite más importantes.',
    attachActiveFile: true,
  },
  {
    trigger: 'explicar',
    label: '/explicar',
    expansion: 'Explicame paso a paso qué hace este código y por qué está escrito así.',
    attachActiveFile: true,
  },
  {
    trigger: 'refactor',
    label: '/refactor',
    expansion: 'Refactorizá este código para que sea más claro y mantenible, sin cambiar su comportamiento.',
    attachActiveFile: true,
  },
  {
    trigger: 'seguridad',
    label: '/seguridad',
    expansion:
      'Revisá este código en busca de vulnerabilidades de seguridad comunes (inyección, validación de entrada, ' +
      'manejo de secretos, etc.) y proponé correcciones.',
    attachActiveFile: true,
  },
];

/** Comandos rápidos configurables (`/test`, `/explicar`, ...) que expanden a
 * una instrucción fija en el composer. Se siembran con 4 por defecto la
 * primera vez, mismo espíritu que BUILT_IN_AGENTS. */
export class PromptTemplateStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  list(): PromptTemplate[] {
    const stored = this.context.globalState.get<PromptTemplate[]>(STORE_KEY);
    if (stored) return stored;
    const seeded = DEFAULT_TEMPLATES.map((t) => ({ ...t, id: randomUUID() }));
    void this.context.globalState.update(STORE_KEY, seeded);
    return seeded;
  }

  private async save(templates: PromptTemplate[]): Promise<void> {
    await this.context.globalState.update(STORE_KEY, templates);
  }

  async add(input: Omit<PromptTemplate, 'id'>): Promise<PromptTemplate> {
    const template: PromptTemplate = { ...input, id: randomUUID() };
    const templates = this.list();
    templates.push(template);
    await this.save(templates);
    return template;
  }

  async remove(id: string): Promise<void> {
    await this.save(this.list().filter((t) => t.id !== id));
  }
}
