import * as vscode from 'vscode';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, AUTH_REDIRECT_URL } from './supabaseConfig';
import { SecretStorageAdapter } from './secretStorageAdapter';
import { AuthUser } from '../shared/protocol';

export type OAuthProvider = 'github' | 'google';

export type AuthResult = { ok: true } | { ok: false; message: string };
export type SignUpResult = { ok: true; needsConfirmation: boolean } | { ok: false; message: string };

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
    } = this.client.auth.onAuthStateChange((_event, session) => {
      callback(session?.user ? toAuthUser(session.user) : null);
    });
    return new vscode.Disposable(() => subscription.unsubscribe());
  }

  async getUser(): Promise<AuthUser | null> {
    try {
      const { data } = await withTimeout(this.client.auth.getSession(), 8000);
      return data.session?.user ? toAuthUser(data.session.user) : null;
    } catch {
      // Supabase no respondió a tiempo (sin red, caído, etc.) — no dejamos
      // colgada la pantalla de carga, tratamos esto como "sin sesión".
      return null;
    }
  }

  async signInWithPassword(email: string, password: string): Promise<AuthResult> {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, message: translateError(error.message) };
    return { ok: true };
  }

  async signUp(email: string, password: string): Promise<SignUpResult> {
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) return { ok: false, message: translateError(error.message) };
    return { ok: true, needsConfirmation: !data.session };
  }

  async beginOAuthSignIn(provider: OAuthProvider): Promise<string> {
    const { data, error } = await this.client.auth.signInWithOAuth({
      provider,
      options: { redirectTo: AUTH_REDIRECT_URL, skipBrowserRedirect: true },
    });
    if (error || !data.url) {
      throw new Error(error?.message ?? 'No se pudo iniciar el login.');
    }
    return data.url;
  }

  async completeOAuthSignIn(code: string): Promise<void> {
    const { error } = await this.client.auth.exchangeCodeForSession(code);
    if (error) throw new Error(translateError(error.message));
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }
}

function toAuthUser(user: User): AuthUser {
  const meta = user.user_metadata ?? {};
  const name: string = meta.full_name || meta.name || (user.email ? user.email.split('@')[0] : 'Usuario');
  const avatarUrl: string | null = meta.avatar_url || meta.picture || null;
  const provider = user.app_metadata?.provider ?? 'email';
  return { id: user.id, email: user.email ?? null, name, avatarUrl, provider };
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
