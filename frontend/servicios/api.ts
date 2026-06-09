import { API_URL, TOKEN_KEY, REFRESH_KEY } from '../utils/constantes';
import type { RespuestaApi, ErrorApi } from '../tipos/api.tipos';

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_URL;
  }

  private getHeaders(auth = true): HeadersInit {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (auth && typeof window !== 'undefined') {
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    const data = await res.json();
    if (!res.ok) {
      const error = data as ErrorApi;
      throw new ApiError(error.mensaje || 'Error desconocido', res.status, error.errores);
    }
    // El backend envuelve toda respuesta con TransformarInterceptor:
    //   { exitoso: true, datos: <T | null>, timestamp, meta? }
    // No podemos usar `?? data` porque cuando `datos` es `null` legítimamente
    // (ej. /cajas/activo sin turno) el `??` devolvía el wrapper completo en vez de null.
    if (
      data !== null &&
      typeof data === 'object' &&
      'exitoso' in data &&
      'datos' in data
    ) {
      return (data as RespuestaApi<T>).datos;
    }
    return data as T;
  }

  async get<T>(path: string, auth = true): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { headers: this.getHeaders(auth) });
    return this.handleResponse<T>(res);
  }

  async post<T>(path: string, body?: unknown, auth = true): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.getHeaders(auth),
      body: body ? JSON.stringify(body) : undefined,
    });
    return this.handleResponse<T>(res);
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    return this.handleResponse<T>(res);
  }

  async delete<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    return this.handleResponse<T>(res);
  }
}

export class ApiError extends Error {
  status: number;
  errores?: Record<string, string[]>;

  constructor(mensaje: string, status: number, errores?: Record<string, string[]>) {
    super(mensaje);
    this.name = 'ApiError';
    this.status = status;
    this.errores = errores;
  }
}

export const api = new ApiClient();
