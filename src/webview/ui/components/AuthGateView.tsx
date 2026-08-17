import { useEffect, useState } from 'react';
import { postToExtension, onExtensionMessage } from '../vscodeApi';
import { IconHuggingFace } from './Icon';
import { LOGO_URI } from '../logo';

export function AuthGateView() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    const unsubscribe = onExtensionMessage((message) => {
      if (message.type === 'authError') {
        setError(message.message);
        setBusy(false);
      }
    });
    return unsubscribe;
  }, []);

  function signInWeb() {
    setBusy(true);
    setError(undefined);
    postToExtension({ type: 'authSignInWeb' });
    // El login vuelve por un roundtrip al navegador externo — si el
    // usuario lo cancela ahí no llega ningún mensaje de vuelta, así que
    // liberamos el botón igual después de un rato en vez de dejarlo trabado.
    setTimeout(() => setBusy(false), 20000);
  }

  function hfSignIn() {
    setBusy(true);
    setError(undefined);
    postToExtension({ type: 'hfSignIn' });
    setTimeout(() => setBusy(false), 20000);
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
        <h1 className="view-title">Iniciá sesión</h1>
        <p className="view-subtitle">Necesitás una cuenta para usar Scorpk.</p>

        <div className="oauth-buttons">
          <button type="button" className="btn-primary oauth-btn" onClick={signInWeb} disabled={busy}>
            {busy ? 'Un momento...' : 'Iniciar sesión en scorpk.tech'}
          </button>
          <button type="button" className="btn-ghost oauth-btn" onClick={hfSignIn} disabled={busy}>
            <IconHuggingFace size={16} />
            Continuar con Hugging Face
          </button>
        </div>

        {error && <div className="test-error">{error}</div>}

        <p className="view-subtitle">Se abre el navegador — correo y contraseña, GitHub o Google, lo que ya uses.</p>
      </div>
    </div>
  );
}
