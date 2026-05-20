/**
 * Valida y normaliza la lista de orígenes permitidos para CORS.
 *
 * Reglas de seguridad (SIS-25):
 *  - Wildcards (`*`) están prohibidos en cualquier entorno cuando se combinan
 *    con `credentials: true` — el navegador rechaza esa combinación y, peor,
 *    si se hace reflejando el Origin (`origin: true`) se abre cross-site
 *    credentialed reads.
 *  - En producción la lista no puede estar vacía: forzamos configuración
 *    explícita vía CORS_ORIGINS.
 *  - Cada entrada debe ser una URL absoluta http/https sin path ni trailing
 *    slash, para coincidir exactamente con el header `Origin` del browser.
 */
export interface OrigenesValidados {
  lista: ReadonlySet<string>;
  permitidos: readonly string[];
}

export class ConfiguracionCorsInvalidaError extends Error {
  constructor(motivo: string) {
    super(`Configuración CORS inválida: ${motivo}`);
    this.name = 'ConfiguracionCorsInvalidaError';
  }
}

export function normalizarOrigenes(
  origenes: readonly string[] | undefined,
  entorno: string,
): OrigenesValidados {
  const esProduccion = entorno === 'production';
  const limpios = (origenes ?? [])
    .map((o) => o?.trim())
    .filter((o): o is string => !!o && o.length > 0);

  if (limpios.length === 0) {
    if (esProduccion) {
      throw new ConfiguracionCorsInvalidaError(
        'CORS_ORIGINS está vacío en producción. Configura una allowlist explícita.',
      );
    }
    // En dev permitimos lista vacía → ningún cross-origin permitido (same-origin only).
    return { lista: new Set(), permitidos: [] };
  }

  for (const origen of limpios) {
    if (origen === '*' || origen.includes('*')) {
      throw new ConfiguracionCorsInvalidaError(
        `Wildcards están prohibidos (recibido: "${origen}"). Lista cada origen completo.`,
      );
    }

    let url: URL;
    try {
      url = new URL(origen);
    } catch {
      throw new ConfiguracionCorsInvalidaError(
        `Origen "${origen}" no es una URL válida.`,
      );
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new ConfiguracionCorsInvalidaError(
        `Origen "${origen}" debe usar http o https.`,
      );
    }

    if (esProduccion && url.protocol === 'http:' && url.hostname !== 'localhost') {
      throw new ConfiguracionCorsInvalidaError(
        `Origen "${origen}" usa http en producción. Solo https está permitido.`,
      );
    }

    if (url.pathname !== '/' && url.pathname !== '') {
      throw new ConfiguracionCorsInvalidaError(
        `Origen "${origen}" no debe incluir path (recibido: "${url.pathname}").`,
      );
    }
  }

  // Normaliza a la forma exacta del header Origin: protocolo + host (+ puerto si no es default).
  const normalizados = limpios.map((o) => new URL(o).origin);
  return {
    lista: new Set(normalizados),
    permitidos: [...new Set(normalizados)],
  };
}

export function esOrigenPermitido(
  origen: string | undefined,
  permitidos: ReadonlySet<string>,
): boolean {
  if (!origen) return false;
  return permitidos.has(origen);
}
