import { AuthUser } from '../../../shared/protocol';
import { postToExtension } from '../vscodeApi';
import { ViewHeader } from './ViewHeader';

interface Props {
  user: AuthUser;
}

export function AccountView({ user }: Props) {
  return (
    <div className="view">
      <ViewHeader title="Cuenta" subtitle="Tu sesión en Scorpk" />
      <div className="static-view-body">
        <div className="account-profile">
          {user.avatarUrl ? (
            <img className="account-avatar" src={user.avatarUrl} alt="" />
          ) : (
            <span className="account-avatar account-avatar-fallback">{user.name.charAt(0).toUpperCase()}</span>
          )}
          <div>
            <div className="account-name">{user.name}</div>
            {user.email && <div className="muted">{user.email}</div>}
            <div className="muted">Conectado con {providerLabel(user.provider)}</div>
          </div>
        </div>
        <button
          className="btn-ghost"
          onClick={() => postToExtension({ type: user.provider === 'huggingface' ? 'hfSignOut' : 'authSignOut' })}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

function providerLabel(provider: string): string {
  if (provider === 'github') return 'GitHub';
  if (provider === 'google') return 'Google';
  if (provider === 'huggingface') return 'Hugging Face';
  return 'correo';
}
