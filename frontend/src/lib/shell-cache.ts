/**
 * Cache del shell (index.html) de la aplicacion.
 *
 * El shell se sirve siempre desde la red para no mostrar el de un despliegue
 * anterior, pero se guarda una copia para poder abrir la aplicacion cuando el
 * servidor no responde (por ejemplo, durante un reinicio).
 */

/** Nombre de la cache donde se guarda el shell. */
export const SHELL_CACHE = "shell-cache";

/** Ruta canonica del shell: sirve de reserva para cualquier ruta. */
export function canonicalShellUrl(origin: string): string {
  return new URL("/", origin).toString();
}

/**
 * Guarda el shell servido: con la ruta que se pidio (para recuperarla tal
 * cual) y con la ruta canonica (para abrir cualquier pagina sin conexion).
 */
export async function storeShell(
  cache: Cache,
  request: Request,
  response: Response,
  origin: string,
): Promise<void> {
  await cache.put(request, response.clone());
  await cache.put(canonicalShellUrl(origin), response.clone());
}

/**
 * Ultimo shell conocido: el de la ruta pedida o, si no hay, el canonico.
 */
export async function findShell(
  cache: Cache,
  request: Request,
  origin: string,
): Promise<Response | undefined> {
  const exact = await cache.match(request);
  if (exact) return exact;
  return cache.match(canonicalShellUrl(origin));
}
