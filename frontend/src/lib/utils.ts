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
