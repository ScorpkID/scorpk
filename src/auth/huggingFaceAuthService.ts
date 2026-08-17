import * as vscode from 'vscode';
import { randomBytes, createHash } from 'crypto';
import { HUGGINGFACE_CLIENT_ID, HUGGINGFACE_REDIRECT_URL, HUGGINGFACE_SCOPES } from './huggingFaceConfig';
import { AuthUser } from '../shared/protocol';

const AUTHORIZE_URL = 'https://huggingface.co/oauth/authorize';
const TOKEN_URL = 'https://huggingface.co/oauth/token';
const USERINFO_URL = 'https://huggingface.co/oauth/userinfo';

const SECRET_PREFIX = 'scorpk.hf.';
const ACCESS_TOKEN_KEY = SECRET_PREFIX + 'accessToken';
const REFRESH_TOKEN_KEY = SECRET_PREFIX + 'refreshToken';
const EXPIRES_AT_KEY = SECRET_PREFIX + 'expiresAt';

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

/**
 * Login OAuth con Hugging Face, independiente de Supabase (HF no es un
 * proveedor nativo de Supabase Auth). El mismo access_token sirve para dos
 * cosas: identidad ligera (gate de la app) y credencial de inferencia
 * (scope inference-api) contra router.huggingface.co.
 */
export class HuggingFaceAuthService {
  private pendingVerifier: string | undefined;
  private cachedUser: AuthUser | null | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  beginSignIn(): string {
    const verifier = base64Url(randomBytes(48));
    const challenge = base64Url(createHash('sha256').update(verifier).digest());
    this.pendingVerifier = verifier;
    const params = new URLSearchParams({
      client_id: HUGGINGFACE_CLIENT_ID,
      redirect_uri: HUGGINGFACE_REDIRECT_URL,
      response_type: 'code',
      scope: HUGGINGFACE_SCOPES,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: base64Url(randomBytes(16)),
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async completeSignIn(code: string): Promise<void> {
    const verifier = this.pendingVerifier;
    this.pendingVerifier = undefined;
    if (!verifier) throw new Error('No había un login de Hugging Face en curso.');

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: HUGGINGFACE_CLIENT_ID,
        code,
        redirect_uri: HUGGINGFACE_REDIRECT_URL,
        code_verifier: verifier,
      }).toString(),
    });
    if (!response.ok) {
      throw new Error(`No se pudo completar el login con Hugging Face (${response.status}).`);
    }
    const json = (await response.json()) as TokenResponse;
    await this.storeTokens(json);
    this.cachedUser = undefined;
  }

  async signOut(): Promise<void> {
    await this.context.secrets.delete(ACCESS_TOKEN_KEY);
    await this.context.secrets.delete(REFRESH_TOKEN_KEY);
    await this.context.secrets.delete(EXPIRES_AT_KEY);
    this.cachedUser = null;
  }

  async isConnected(): Promise<boolean> {
    return !!(await this.context.secrets.get(ACCESS_TOKEN_KEY));
  }

  /** Devuelve un access token válido, refrescándolo si ya venció. */
  async getValidAccessToken(): Promise<string | undefined> {
    const accessToken = await this.context.secrets.get(ACCESS_TOKEN_KEY);
    if (!accessToken) return undefined;
    const expiresAtRaw = await this.context.secrets.get(EXPIRES_AT_KEY);
    const expiresAt = expiresAtRaw ? Number(expiresAtRaw) : undefined;
    if (!expiresAt || Date.now() < expiresAt) return accessToken;

    const refreshToken = await this.context.secrets.get(REFRESH_TOKEN_KEY);
    if (!refreshToken) return accessToken; // sin refresh token, seguimos con el que hay y dejamos que falle la llamada

    try {
      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: HUGGINGFACE_CLIENT_ID,
          refresh_token: refreshToken,
        }).toString(),
      });
      if (!response.ok) return accessToken;
      const json = (await response.json()) as TokenResponse;
      await this.storeTokens(json);
      return json.access_token;
    } catch {
      return accessToken;
    }
  }

  async getUser(): Promise<AuthUser | null> {
    if (this.cachedUser !== undefined) return this.cachedUser;
    const token = await this.getValidAccessToken();
    if (!token) {
      this.cachedUser = null;
      return null;
    }
    try {
      const response = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(String(response.status));
      const info: any = await response.json();
      const user: AuthUser = {
        id: info.sub ?? info.name ?? 'hf-user',
        email: info.email ?? null,
        name: info.name || info.preferred_username || 'Usuario de Hugging Face',
        avatarUrl: info.picture ?? null,
        provider: 'huggingface',
        plan: 'free',
      };
      this.cachedUser = user;
      return user;
    } catch {
      this.cachedUser = null;
      return null;
    }
  }

  private async storeTokens(json: TokenResponse): Promise<void> {
    await this.context.secrets.store(ACCESS_TOKEN_KEY, json.access_token);
    if (json.refresh_token) {
      await this.context.secrets.store(REFRESH_TOKEN_KEY, json.refresh_token);
    }
    if (json.expires_in) {
      await this.context.secrets.store(EXPIRES_AT_KEY, String(Date.now() + json.expires_in * 1000));
    } else {
      await this.context.secrets.delete(EXPIRES_AT_KEY);
    }
  }
}

function base64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
