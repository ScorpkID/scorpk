import { AuthUser } from '../../../shared/protocol';
import { postToExtension } from '../vscodeApi';
import { ViewHeader } from './ViewHeader';

interface Props {
  user: AuthUser;
}

export function AccountView({ user }: Props) {
  const isPro = user.plan === 'pro';
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
            <div className="account-name">
              {user.name} <span className={`plan-badge ${isPro ? 'plan-badge-pro' : ''}`}>{isPro ? 'Pro' : 'Free'}</span>
            </div>
            {user.email && <div className="muted">{user.email}</div>}
            <div className="muted">Conectado con {providerLabel(user.provider)}</div>
          </div>
        </div>
        {!isPro && (
          <button
            className="btn-primary"
            onClick={() => postToExtension({ type: 'openExternalUrl', url: 'https://scorpk.tech/pricing' })}
          >
            Pasar a Pro
          </button>
        )}
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
