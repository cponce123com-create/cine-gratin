/**
 * Optimiza las URLs de imágenes de TMDB si es posible.
 * Si la URL es de TMDB, intenta cambiar el tamaño a uno más pequeño para el catálogo.
 */
export function optimizeImageUrl(url: string | null | undefined, size: "small" | "medium" | "large" = "medium"): string {
  if (!url) return "";

  // Si es una URL de TMDB
  if (url.includes("tmdb.org/t/p/")) {
    const sizes = {
      small: "w185",
      medium: "w342",
      large: "w500",
    };

    // Reemplazar el tamaño actual por el deseado
    // Las URLs suelen ser .../t/p/original/... o .../t/p/w500/...
    return url.replace(/\/t\/p\/[^/]+/, `/t/p/${sizes[size]}`);
  }

  return url;
}

/**
 * Genera un srcset responsivo para imágenes de póster de TMDB.
 * Permite al navegador elegir el tamaño óptimo según el dispositivo y la DPR.
 */
export function tmdbSrcSet(url: string | null | undefined): string {
  if (!url || !url.includes("image.tmdb.org/t/p/")) return "";
  const match = url.match(/\/t\/p\/[^/]+(\/[^?]+)/);
  if (!match) return "";
  const imgPath = match[1];
  const base = "https://image.tmdb.org/t/p";
  return [
    `${base}/w185${imgPath} 185w`,
    `${base}/w342${imgPath} 342w`,
    `${base}/w500${imgPath} 500w`,
  ].join(", ");
}
