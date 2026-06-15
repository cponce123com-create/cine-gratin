# Despliegue de Cine Gratin

## 📦 Frontend (Vite + React)

Despliega en **Vercel** o **Netlify**:

1. Conecta tu repositorio a Vercel/Netlify.
2. Configura la variable de entorno:
   - `VITE_API_URL` — URL del backend desplegado (ej: `https://tu-backend.onrender.com`)
3. Comando de build: `cd frontend && pnpm build`
4. Directorio de salida: `frontend/dist`
5. Despliega.

## 🚀 Backend (Express + TypeScript)

### Opción 1: Render (recomendado)

1. Crea un **Web Service** en [Render](https://render.com).
2. Conecta tu repositorio (rama `main`).
3. Configura:

   | Campo             | Valor                         |
   | ----------------- | ----------------------------- |
   | **Runtime**       | Node                          |
   | **Build Command** | `bash render-build.sh`        |
   | **Start Command** | `node backend/dist/index.mjs` |

4. Configura las variables de entorno:

   | Variable          | Requerida | Descripción                                                                            |
   | ----------------- | --------- | -------------------------------------------------------------------------------------- |
   | `DATABASE_URL`    | ✅        | URL de conexión PostgreSQL                                                             |
   | `JWT_SECRET`      | ✅        | Genera con: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
   | `NODE_ENV`        | ✅        | `production`                                                                           |
   | `TMDB_API_KEY`    | ❌        | Clave de API de TMDB                                                                   |
   | `YOUTUBE_API_KEY` | ❌        | Para importación de YouTube                                                            |
   | `CORS_ORIGIN`     | ❌        | Dominio del frontend (ej: `https://tudominio.vercel.app`)                              |

5. Crea una base de datos **Render PostgreSQL** y copia la `DATABASE_URL` interna.
6. Despliega.

### Opción 2: Docker / VPS

```bash
# Build
pnpm install
pnpm render:build

# Iniciar
NODE_ENV=production DATABASE_URL=postgresql://... JWT_SECRET=... node backend/dist/index.mjs
```

## 🔗 Conexión Frontend-Backend

- Asegúrate de que `VITE_API_URL` apunte a la URL del backend desplegado.
- Configura `CORS_ORIGIN` en el backend para permitir el dominio del frontend.

## ⚙️ CI/CD (GitHub Actions)

El proyecto incluye dos workflows:

- **CI** (`.github/workflows/ci.yml`): Se ejecuta en cada PR y push a `main`:
  - Linting (Prettier)
  - Type checking (root, frontend, backend)
  - Build de frontend
  - **Deploy a Render** (solo en push a `main`, si se configuran los secrets)

### Secrets requeridos en GitHub

| Secret              | Descripción                                                          |
| ------------------- | -------------------------------------------------------------------- |
| `RENDER_API_KEY`    | API key de Render (Settings > API Keys)                              |
| `RENDER_SERVICE_ID` | ID del servicio en Render (de la URL: `render.com/services/srv-xxx`) |

### Configurar secrets

1. Ve a GitHub repo > Settings > Secrets and variables > Actions.
2. Agrega `RENDER_API_KEY` y `RENDER_SERVICE_ID`.
3. Los deploys automáticos se activarán al hacer push a `main`.

> **Nota:** Como alternativa, también puedes usar un **Deploy Hook** de Render (URL única) configurando el secret `RENDER_DEPLOY_HOOK_URL`.
