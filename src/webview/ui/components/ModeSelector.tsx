import { PermissionMode } from '../../../shared/protocol';
import { IconEdit, IconHand, IconListChecks, IconZap } from './Icon';

interface Props {
  value: PermissionMode;
  onChange: (mode: PermissionMode) => void;
  disabled?: boolean;
}

const MODES: Array<{ value: PermissionMode; label: string; icon: (size: number) => JSX.Element; title: string }> = [
  {
    value: 'manual',
    label: 'Manual',
    icon: (size) => <IconHand size={size} />,
    title: 'Pide aprobación para cada acción que modifique el workspace.',
  },
  {
    value: 'auto-edit',
    label: 'Auto-editar',
    icon: (size) => <IconEdit size={size} />,
    title: 'Aprueba solo escritura/borrado de archivos automáticamente; la terminal sigue pidiendo confirmación.',
  },
  {
    value: 'plan',
    label: 'Plan',
    icon: (size) => <IconListChecks size={size} />,
    title: 'Solo lectura: no ejecuta cambios, investiga y devuelve un plan.',
  },
  {
    value: 'auto',
    label: 'Auto',
    icon: (size) => <IconZap size={size} />,
    title: 'Aprueba todo automáticamente, sin preguntar.',
  },
];

export function ModeSelector({ value, onChange, disabled }: Props) {
  return (
    <div className="mode-selector" role="radiogroup" aria-label="Modo de permisos">
      {MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          title={m.title}
          className={value === m.value ? 'mode-option active' : 'mode-option'}
          disabled={disabled}
          onClick={() => onChange(m.value)}
        >
          {m.icon(13)}
          {m.label}
        </button>
      ))}
    </div>
  );
}
