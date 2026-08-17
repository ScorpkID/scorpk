import { ToolDef } from '../types';
import { listSkills, loadSkillBody } from '../../skills/skillLoader';

export const useSkillTool: ToolDef = {
  name: 'use_skill',
  description:
    'Carga las instrucciones completas de una skill disponible, dado su nombre exacto (ver la lista de skills ' +
    'disponibles en tus instrucciones). Usala cuando la tarea del usuario calce con la descripción de una skill ' +
    '— recién ahí se cargan sus instrucciones, no antes.',
  parameters: {
    type: 'object',
    properties: { skill: { type: 'string', description: 'Nombre exacto de la skill' } },
    required: ['skill'],
  },
  requiresApproval: false,
};

export async function useSkillHandler(args: Record<string, unknown>): Promise<string> {
  const name = String(args.skill ?? '').trim();
  if (!name) return 'Error: skill no puede estar vacío.';
  const body = await loadSkillBody(name);
  if (body !== undefined) return body;

  const available = await listSkills();
  const names = available.map((s) => s.name).join(', ') || '(ninguna)';
  return `Error: no existe una skill llamada "${name}". Skills disponibles: ${names}`;
}
