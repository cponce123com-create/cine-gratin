# Frontend — Cine Gratin

Aplicación React + TypeScript + Vite + Tailwind CSS.

## Requisitos

- Node.js 20+
- pnpm 9+

## Variables de entorno

Copiar `.env.example` a `.env`:

```bash
cp frontend/.env.example frontend/.env
```

| Variable | Descripción | Por defecto |
|---|---|---|
| `VITE_API_URL` | URL base del backend | `http://localhost:3000` |

## Scripts

```bash
pnpm dev          # Iniciar servidor de desarrollo (hot-reload)
pnpm build        # Build de producción
pnpm typecheck    # Verificación de tipos
```

## Stack

- **React 19** con react-router-dom v7
- **TanStack React Query** para fetching de datos
- **Tailwind CSS 3** para estilos
- **HLS.js** para reproducción de video
- **Lucide React** para iconos
