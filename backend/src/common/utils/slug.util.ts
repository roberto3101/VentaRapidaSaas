export const generarSlug = (texto: string): string =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remover acentos
    .replace(/[^a-z0-9\s-]/g, '')   // Solo alfanuméricos
    .replace(/\s+/g, '-')           // Espacios → guiones
    .replace(/-+/g, '-')            // Guiones múltiples → uno
    .replace(/^-|-$/g, '');          // Guiones al inicio/fin

export const generarSlugUnico = (texto: string): string =>
  `${generarSlug(texto)}-${Date.now().toString(36)}`;
