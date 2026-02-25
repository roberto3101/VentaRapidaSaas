import { api } from './api';
import type { Tokens, Usuario, LoginPayload, RegistroTenantPayload } from '../tipos/auth.tipos';
import { TOKEN_KEY, REFRESH_KEY } from '../utils/constantes';

export const authServicio = {
  async login(payload: LoginPayload): Promise<Tokens> {
    const tokens = await api.post<Tokens>('/auth/login', payload, false);
    this.guardarTokens(tokens);
    return tokens;
  },

  async registrarTenant(payload: RegistroTenantPayload): Promise<Tokens> {
    const tokens = await api.post<Tokens>('/auth/registro-tenant', payload, false);
    this.guardarTokens(tokens);
    return tokens;
  },

  async obtenerPerfil(): Promise<Usuario> {
    return api.get<Usuario>('/auth/perfil');
  },

  async refresh(): Promise<Tokens> {
    const tokenRefresh = localStorage.getItem(REFRESH_KEY);
    const tokens = await api.post<Tokens>('/auth/refresh', { tokenRefresh });
    this.guardarTokens(tokens);
    return tokens;
  },

  async logout(): Promise<void> {
    try { await api.post('/auth/logout'); } catch {}
    this.limpiarTokens();
  },

  guardarTokens(tokens: Tokens) {
    localStorage.setItem(TOKEN_KEY, tokens.tokenAcceso);
    localStorage.setItem(REFRESH_KEY, tokens.tokenRefresh);
  },

  limpiarTokens() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },

  tieneToken(): boolean {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem(TOKEN_KEY);
  },
};
