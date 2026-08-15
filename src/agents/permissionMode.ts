import { PermissionMode } from '../shared/protocol';

const TERMINAL_TOOL = 'run_terminal_command';

export interface ApprovalDecision {
  approved: boolean;
  reason?: string;
}

export async function resolveApproval(
  mode: PermissionMode,
  toolName: string,
  promptUser: () => Promise<boolean>,
): Promise<ApprovalDecision> {
  switch (mode) {
    case 'auto':
      return { approved: true };
    case 'auto-edit':
      if (toolName === TERMINAL_TOOL) {
        return { approved: await promptUser() };
      }
      return { approved: true };
    case 'plan':
      return {
        approved: false,
        reason: 'Modo Plan: esta acción no se ejecuta, solo lectura e investigación.',
      };
    case 'manual':
    default:
      return { approved: await promptUser() };
  }
}

export function permissionModeSystemSuffix(mode: PermissionMode): string {
  if (mode === 'plan') {
    return (
      '\n\nEstás en modo Plan: no podés escribir archivos, borrar archivos ni ejecutar comandos de terminal — ' +
      'cualquier intento va a ser rechazado automáticamente. Usá las herramientas de lectura disponibles para ' +
      'investigar lo que necesites, y devolvé un plan de acción concreto y por pasos en tu respuesta final, sin ' +
      'intentar ejecutar los cambios vos mismo.'
    );
  }
  return '';
}
