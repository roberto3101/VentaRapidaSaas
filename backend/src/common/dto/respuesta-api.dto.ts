export class MetaPaginacion {
  total: number;
  pagina: number;
  limite: number;
  totalPaginas: number;
}

export class RespuestaPaginada<T> {
  datos: T[];
  meta: MetaPaginacion;

  static crear<T>(datos: T[], total: number, pagina: number, limite: number): RespuestaPaginada<T> {
    const respuesta = new RespuestaPaginada<T>();
    respuesta.datos = datos;
    respuesta.meta = {
      total,
      pagina,
      limite,
      totalPaginas: Math.ceil(total / limite),
    };
    return respuesta;
  }
}
