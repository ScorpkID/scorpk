import { FormEvent, useEffect, useState } from 'react';
import { postToExtension, onExtensionMessage } from '../vscodeApi';
import { IconGithub, IconGoogle } from './Icon';
import { LOGO_URI } from '../logo';

type Mode = 'signin' | 'signup';

export function AuthGateView() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [info, setInfo] = useState<string | undefined>();

  useEffect(() => {
    const unsubscribe = onExtensionMessage((message) => {
      if (message.type === 'authError') {
        setError(message.message);
        setBusy(false);
      } else if (message.type === 'authInfo') {
        setInfo(message.message);
        setBusy(false);
      }
    });
    return unsubscribe;
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(undefined);
    setInfo(undefined);
    if (mode === 'signin') {
      postToExtension({ type: 'authSignInWithPassword', email: email.trim(), password });
    } else {
      postToExtension({ type: 'authSignUp', email: email.trim(), password });
    }
  }

  function oauth(provider: 'github' | 'google') {
    setBusy(true);
    setError(undefined);
    setInfo(undefined);
    postToExtension({ type: 'authSignInWithOAuth', provider });
  }

  function switchMode() {
    setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
    setError(undefined);
    setInfo(undefined);
  }

  return (
    <div className="auth-gate">
      <div className="auth-gate-card">
        <div className="auth-gate-brand">
          <span className="app-logo auth-gate-logo">
            <img src={LOGO_URI} alt="" />
          </span>
          <span className="app-title">Scorpk</span>
        </div>
        <h1 className="view-title">{mode === 'signin' ? 'Iniciá sesión' : 'Creá tu cuenta'}</h1>
        <p className="view-subtitle">Necesitás una cuenta para usar Scorpk.</p>

        <div className="oauth-buttons">
          <button type="button" className="btn-ghost oauth-btn" onClick={() => oauth('github')} disabled={busy}>
            <IconGithub size={16} />
            Continuar con GitHub
          </button>
          <button type="button" className="btn-ghost oauth-btn" onClick={() => oauth('google')} disabled={busy}>
            <IconGoogle size={16} />
            Continuar con Google
          </button>
        </div>

        <div className="divider">
          <span>o con tu correo</span>
        </div>

        <form className="provider-form" onSubmit={submit}>
          <label>
            Correo
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vos@ejemplo.com" />
          </label>
          <label>
            Contraseña
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </label>
          {error && <div className="test-error">{error}</div>}
          {info && <div className="test-ok">{info}</div>}
          <div className="form-actions">
            <button type="submit" disabled={busy}>
              {busy ? 'Un momento...' : mode === 'signin' ? 'Iniciar sesión' : 'Crear cuenta'}
            </button>
          </div>
        </form>

        <button type="button" className="btn-ghost" onClick={switchMode}>
          {mode === 'signin' ? '¿No tenés cuenta? Creá una' : '¿Ya tenés cuenta? Iniciá sesión'}
        </button>
      </div>
    </div>
  );
}
