export interface RespuestaApi<T = unknown> {
  exitoso: boolean;
  datos: T;
  meta?: MetaPaginacion;
  timestamp: string;
}

export interface MetaPaginacion {
  total: number;
  pagina: number;
  limite: number;
  totalPaginas: number;
}

export interface ErrorApi {
  exitoso: false;
  codigoEstado: number;
  mensaje: string;
  errores?: Record<string, string[]>;
  timestamp: string;
  ruta: string;
}
