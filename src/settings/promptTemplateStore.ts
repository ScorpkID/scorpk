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
  {
    trigger: 'init',
    label: '/init',
    expansion:
      'Explorá la estructura de este proyecto (list_dir y read_file de los archivos de configuración principales — ' +
      'package.json, tsconfig, etc.) y creá un archivo SCORPK.md en la raíz con instrucciones específicas para ' +
      'trabajar acá: stack y arquitectura, convenciones de código, cómo correr build/tests/lint, y cualquier otro ' +
      'detalle que un agente necesite para no tener que redescubrirlo cada vez. Si SCORPK.md ya existe, leelo ' +
      'primero y proponé mejoras puntuales en vez de sobreescribirlo entero.',
    attachActiveFile: false,
  },
];

/** Comandos rápidos configurables (`/test`, `/explicar`, ...) que expanden a
 * una instrucción fija en el composer. Se siembran con 4 por defecto la
 * primera vez, mismo espíritu que BUILT_IN_AGENTS. */
export class PromptTemplateStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  list(): PromptTemplate[] {
    const stored = this.context.globalState.get<PromptTemplate[]>(STORE_KEY);
    if (!stored) {
      const seeded = DEFAULT_TEMPLATES.map((t) => ({ ...t, id: randomUUID() }));
      void this.context.globalState.update(STORE_KEY, seeded);
      return seeded;
    }
    // Instalaciones existentes ya sembraron su lista una sola vez — si se
    // suma un comando nuevo a DEFAULT_TEMPLATES más adelante (como /init),
    // esto lo agrega también ahí en vez de dejarlo solo para instalaciones
    // nuevas. Nunca toca ni pisa los triggers que el usuario ya tiene.
    const missing = DEFAULT_TEMPLATES.filter((d) => !stored.some((s) => s.trigger === d.trigger));
    if (missing.length === 0) return stored;
    const merged = [...stored, ...missing.map((t) => ({ ...t, id: randomUUID() }))];
    void this.context.globalState.update(STORE_KEY, merged);
    return merged;
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
