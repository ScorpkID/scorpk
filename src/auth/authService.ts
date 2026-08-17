import * as vscode from 'vscode';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SCORPK_WEB_URL } from './supabaseConfig';
import { SecretStorageAdapter } from './secretStorageAdapter';
import { AuthUser } from '../shared/protocol';

export class AuthService {
  private readonly client: SupabaseClient;

  constructor(context: vscode.ExtensionContext) {
    this.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: new SecretStorageAdapter(context.secrets),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    });
  }

  onAuthStateChange(callback: (user: AuthUser | null) => void): vscode.Disposable {
    const {
      data: { subscription },
    } = this.client.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        callback(null);
        return;
      }
      const plan = await this.getPlan();
      callback(toAuthUser(session.user, plan));
    });
    return new vscode.Disposable(() => subscription.unsubscribe());
  }

  async getUser(): Promise<AuthUser | null> {
    try {
      const { data } = await withTimeout(this.client.auth.getSession(), 8000);
      if (!data.session?.user) return null;
      const plan = await this.getPlan();
      return toAuthUser(data.session.user, plan);
    } catch {
      // Supabase no respondió a tiempo (sin red, caído, etc.) — no dejamos
      // colgada la pantalla de carga, tratamos esto como "sin sesión".
      return null;
    }
  }

  /** Nunca "falla abierto" a pro — cualquier error o falta de fila cae a free. */
  private async getPlan(): Promise<'free' | 'pro'> {
    try {
      const { data } = await withTimeout(
        Promise.resolve(this.client.from('subscriptions').select('plan,status').maybeSingle()),
        5000,
      );
      const row = data as { plan: string; status: string } | null;
      if (row?.plan === 'pro' && (row.status === 'active' || row.status === 'trialing')) return 'pro';
      return 'free';
    } catch {
      return 'free';
    }
  }

  /** URL a abrir en el navegador externo — el login en sí ocurre en scorpk.tech. */
  beginWebSignIn(): string {
    return `${SCORPK_WEB_URL}/login?from=vscode`;
  }

  /** Canjea el código de un solo uso que el sitio manda de vuelta por la URI vscode://. */
  async completeWebSignIn(handoffCode: string): Promise<void> {
    const res = await fetch(`${SCORPK_WEB_URL}/api/vscode/handoff/consume`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: handoffCode }),
    });
    if (!res.ok) {
      throw new Error('No se pudo completar el login — probá iniciar sesión de nuevo.');
    }
    const { access_token, refresh_token } = (await res.json()) as { access_token: string; refresh_token: string };
    const { error } = await this.client.auth.setSession({ access_token, refresh_token });
    if (error) throw new Error(translateError(error.message));
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }
}

function toAuthUser(user: User, plan: 'free' | 'pro'): AuthUser {
  const meta = user.user_metadata ?? {};
  const name: string = meta.full_name || meta.name || (user.email ? user.email.split('@')[0] : 'Usuario');
  const avatarUrl: string | null = meta.avatar_url || meta.picture || null;
  const provider = user.app_metadata?.provider ?? 'email';
  return { id: user.id, email: user.email ?? null, name, avatarUrl, provider, plan };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function translateError(message: string): string {
  if (message.includes('Invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (message.includes('User already registered')) return 'Ya existe una cuenta con ese correo.';
  if (message.includes('Password should be at least')) return 'La contraseña es demasiado corta.';
  if (message.includes('Email not confirmed')) return 'Todavía no confirmaste tu correo — revisá tu bandeja de entrada.';
  return message;
}
