import { AuthUser } from '../../../shared/protocol';
import { IconHelp, IconMessage, IconSettings, IconSliders, IconUsers } from './Icon';

export type ViewId = 'agent' | 'team' | 'providers' | 'settings' | 'help' | 'account';

interface Props {
  active: ViewId;
  onSelect: (view: ViewId) => void;
  logoUri: string;
  user: AuthUser;
}

const PRIMARY_ITEMS: Array<{ id: ViewId; label: string; icon: (size: number) => JSX.Element }> = [
  { id: 'agent', label: 'Agente', icon: (s) => <IconMessage size={s} /> },
  { id: 'team', label: 'Equipo', icon: (s) => <IconUsers size={s} /> },
  { id: 'providers', label: 'Proveedores', icon: (s) => <IconSliders size={s} /> },
];

const SECONDARY_ITEMS: Array<{ id: ViewId; label: string; icon: (size: number) => JSX.Element }> = [
  { id: 'settings', label: 'Ajustes', icon: (s) => <IconSettings size={s} /> },
  { id: 'help', label: 'Ayuda', icon: (s) => <IconHelp size={s} /> },
];

export function Sidebar({ active, onSelect, logoUri, user }: Props) {
  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <span className="app-logo">
          <img src={logoUri} alt="" />
        </span>
        <span className="app-title">Scorpk</span>
      </div>

      <div className="sidebar-nav">
        {PRIMARY_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={active === item.id ? 'nav-item active' : 'nav-item'}
            onClick={() => onSelect(item.id)}
          >
            {item.icon(16)}
            {item.label}
          </button>
        ))}
      </div>

      <div className="sidebar-spacer" />

      <div className="sidebar-nav sidebar-nav-secondary">
        {SECONDARY_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={active === item.id ? 'nav-item active' : 'nav-item'}
            onClick={() => onSelect(item.id)}
          >
            {item.icon(16)}
            {item.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        className={active === 'account' ? 'sidebar-user active' : 'sidebar-user'}
        onClick={() => onSelect('account')}
      >
        {user.avatarUrl ? (
          <img className="user-avatar user-avatar-img" src={user.avatarUrl} alt="" />
        ) : (
          <span className="user-avatar">{user.name.charAt(0).toUpperCase()}</span>
        )}
        <span className="user-info">
          <span className="user-name">{user.name}</span>
          <span className="user-status">
            <span className="user-status-dot" />
            Conectado
          </span>
        </span>
      </button>
    </nav>
  );
}
