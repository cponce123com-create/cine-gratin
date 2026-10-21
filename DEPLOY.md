# Despliegue de Cine Gratin

## 📦 Frontend (Vite + React)

El backend sirve el frontend compilado, por lo que la opción más simple es
desplegar **un único servicio** (Render) con el frontend y la API juntos.

Opción A — Todo en Render (recomendado):

1. Crea un **Web Service** en [Render](https://render.com) conectado a la rama `main`.
2. **Build Command**: `bash render-build.sh`
3. **Start Command**: `node backend/dist/index.mjs`
4. Variables de entorno: las de la tabla siguiente (el frontend queda servido
   por el propio backend, así que no hace falta `CORS_ORIGINS`).

Opción B — Frontend en Vercel/Netlify y API en Render:

1. Conecta el repositorio a Vercel/Netlify.
2. Configura `VITE_API_URL` con la URL del backend (ej: `https://tu-backend.onrender.com`).
3. **Build Command**: `cd frontend && pnpm build`
4. **Output Directory**: `frontend/dist`
5. En el backend, añade el dominio del frontend a `CORS_ORIGINS` y configura la
   cookie de sesión para entornos cruzados:
   `COOKIE_SAME_SITE=none` y `COOKIE_SECURE=true` (obligatorio con `SameSite=None`).

## 🚀 Backend (Express + TypeScript)

### Variables de entorno

| Variable              | Requerida | Descripción                                                                        |
| --------------------- | --------- | ---------------------------------------------------------------------------------- |
| `DATABASE_URL`        | ✅        | URL de conexión PostgreSQL                                                         |
| `PORT`                | ✅        | Puerto del servidor (3000)                                                         |
| `NODE_ENV`            | ✅        | `production` en producción                                                         |
| `JWT_SECRET`          | ✅        | Secreto de firma de sesión (mín. 32 caracteres, no puede ser un valor por defecto) |
| `ADMIN_SECRET`        | ❌        | Secreto adicional para automatizaciones por API (mín. 16 caracteres)               |
| `CORS_ORIGINS`        | ❌        | Orígenes permitidos separados por coma. Sin comodín en producción                  |
| `COOKIE_SAME_SITE`    | ❌        | `lax` (por defecto), `strict` o `none` (frontend en otro dominio)                  |
| `COOKIE_SECURE`       | ❌        | `true` en producción (HTTPS)                                                       |
| `TMDB_API_KEY`        | ❌        | Clave de TMDB para el explorador y las importaciones automáticas                   |
| `YOUTUBE_API_KEY`     | ❌        | Clave de YouTube para los canales de deportes y eventos                            |
| `SESSION_TTL_SECONDS` | ❌        | Duración de la sesión (por defecto 28800 = 8 h)                                    |

La aplicación **no arranca** en producción si falta `JWT_SECRET` o si usa un
valor por defecto conocido. En desarrollo, si falta, se genera un secreto
aleatorio por proceso (las sesiones no sobreviven a un reinicio).

### Esquema y migraciones

El esquema se aplica automáticamente al arrancar, mediante migraciones
versionadas (`backend/src/lib/migrations.ts`) registradas en la tabla
`schema_migrations`. El proceso usa un _advisory lock_ de PostgreSQL, de modo
que varias instancias pueden arrancar a la vez sin_apply la migración dos
veces ni bloquearse entre sí.

Migraciones incluidas:

| Versión | Nombre                   | Contenido                                                |
| ------- | ------------------------ | -------------------------------------------------------- |
| 1       | `core_schema`            | Tablas de películas, series, ajustes, servidores y admin |
| 2       | `sports_schema`          | Canales y partidos deportivos                            |
| 3       | `events_schema`          | Canales y eventos                                        |
| 4       | `sagas_schema`           | Colecciones (sagas)                                      |
| 5       | `import_jobs`            | Trabajos de importación persistentes                     |
| 6       | `search_trigram_indexes` | Índices trigram para la búsqueda (opcional)              |
| 7       | `series_slug_column`     | Columna `slug` en series                                 |

Para revisar el estado: `SELECT version, name, applied_at FROM schema_migrations;`

> La migración 9 crea índices **únicos parciales** sobre `imdb_id` y
> `tmdb_id`. Si el catálogo ya tuviera duplicados, la migración **no falla y
> no borra nada**: registra el motivo en la tabla `schema_issues` y sigue
> arrancando. Para resolver los duplicados:
>
> ```sql
> SELECT imdb_id, count(*) FROM movies
>  WHERE imdb_id ~ '^tt[0-9]{7,10}
> ```

### Usuario administrador

El usuario se guarda en la tabla `cv_auth` con la contraseña en bcrypt:

```bash
# 1. Generar el hash
cd backend && node --input-type=module -e "import bcrypt from 'bcrypt'; console.log(await bcrypt.hash('TU_CONTRASEÑA', 10))"

# 2. Aplicarlo
psql "$DATABASE_URL" -f scripts/set-superadmin.sql -v username="'admin'" -v password="'<HASH>'"
```

> La contraseña debe tener al menos 10 caracteres, con minúscula, mayúscula y
> número. El panel de administración la valida en el servidor.

## 🔐 Sesión, CSRF y CORS

- La sesión se guarda en una cookie `HttpOnly` (`cg_session`): el token no
  es accesible desde JavaScript y no se guarda en `localStorage`.
- Las peticiones que **cambian el estado** y usan la cookie deben enviar la
  cabecera `X-CSRF-Token` con el valor recibido en el login (o en
  `GET /api/auth/session`). El servidor comprueba además que el origen esté
  en la lista permitida. Las peticiones con `Authorization: Bearer` no
  necesitan el token CSRF porque no usan credenciales ambientales.
- El cierre de sesión **revoca la sesión en el servidor**: una copia del
  token deja de funcionar de inmediato.
- El token **nunca** se acepta por query string (`?token=`).

En despliegues cruzados (frontend en otro dominio) hay que permitir la
cabecera en CORS; el backend ya la incluye en `Access-Control-Allow-Headers`.

## 🔗 Sesión y CORS

- La sesión se guarda en una cookie `HttpOnly` (`cg_session`): el token no es
  accesible desde JavaScript, lo que reduce el impacto de un XSS.
- En despliegues de un solo dominio no hace falta configurar nada más.
- En despliegues cruzados: `CORS_ORIGINS` con el origen exacto,
  `COOKIE_SAME_SITE=none` y `COOKIE_SECURE=true`.
- El token también se acepta por cabecera `Authorization: Bearer <token>` para
  automatizaciones. **Nunca** se acepta por query string (`?token=`).

## ⚙️ CI/CD (GitHub Actions)

Existe una única ruta de despliegue: `.github/workflows/ci.yml`.

| Job       | Qué hace                                                             |
| --------- | -------------------------------------------------------------------- |
| `quality` | Prettier, y typecheck de raíz, frontend y backend                    |
| `test`    | Suite de pruebas (Vitest) contra un PostgreSQL efímero del runner    |
| `build`   | Build del frontend y del backend                                     |
| `deploy`  | Despliegue en Render (solo `push` a `main` del repositorio canónico) |

El despliegue **depende** de que las verificaciones anteriores terminen bien.
Los secretos se pasan como variables de entorno (no se interpolan en el
comando) y el trabajo de despliegue comprueba las condiciones del repositorio
para no publicar desde forks.

### Secrets requeridos en GitHub

| Secret                   | Descripción                                          |
| ------------------------ | ---------------------------------------------------- |
| `RENDER_API_KEY`         | API key de Render (Settings > API Keys)              |
| `RENDER_SERVICE_ID`      | ID del servicio (`render.com/services/srv-xxx`)      |
| `RENDER_DEPLOY_HOOK_URL` | Alternativa: deploy hook de Render                   |
| `RENDER_HEALTH_URL`      | URL pública de salud (por ejemplo `.../api/healthz`) |
| `TEST_TMDB_API_KEY`      | Opcional: habilita las pruebas de importación reales |

## 🩺 Comprobaciones de salud

- `GET /api/healthz` — el proceso responde (no consulta la base de datos).
- `GET /api/readyz` — el proceso puede atender tráfico (comprueba la BD).

Configura el health check de Render contra `/api/healthz` para el liveness
probe y contra `/api/readyz` para el readiness probe.

## 🧪 Pruebas en local

> Requiere **Node.js 22.19 o superior**: las pruebas de componentes del frontend
> usan jsdom, que depende de undici 8 (Node ≥ 22.19).

```bash
# Base de datos de pruebas aislada (nunca la de producción)
createdb cine-gratin-test

TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/cine-gratin-test pnpm test
```

Sin `TEST_DATABASE_URL` se ejecutan sólo las pruebas unitarias y las de
base de datos se omiten. La suite incluye pruebas del backend y de los
componentes del frontend (jsdom). Para probar también las importaciones reales:

```bash
TEST_TMDB_API_KEY=tu-clave-de-tmdb pnpm test
```

## 🔐 Avisos de dependencias

La auditoría de **producción** (`pnpm audit --prod --audit-level high`) no
detecta ningún aviso y es obligatoria en la pipeline.

En el árbol de **desarrollo** queda un aviso alto sin parche disponible:
`braces@3.0.3` (GHSA-vfj7-8cjw-p6xm), alcanzado de forma transitiva por
Tailwind a través de `chokidar` y `micromatch`. No existe versión corregida
(afecta a todas las publicadas) y sólo se activa con patrones de glob
profundamente anidados, que en este proyecto sólo provienen de la
configuración propia. No afecta al código que se ejecuta en producción: por eso
la pipeline exige la auditoría de producción y informa de la de desarrollo.

## 🔧 Recuperación ante errores

| Síntoma                          | Causa probable                         | Solución                                                    |
| -------------------------------- | -------------------------------------- | ----------------------------------------------------------- |
| El proceso no arranca            | Falta `JWT_SECRET` en producción       | Configura un secreto de 32+ caracteres                      |
| `401` en todo el panel           | Cookie no válida o `COOKIE_SECURE`     | Revisa `COOKIE_SAME_SITE`, `COOKIE_SECURE` y `CORS_ORIGINS` |
| El navegador no envía la cookie  | Dominios distintos sin `SameSite=None` | `COOKIE_SAME_SITE=none` + `COOKIE_SECURE=true`              |
| La importación no encuentra nada | `TMDB_API_KEY` no configurada          | Añádela a las variables de entorno                          |
| `EADDRINUSE` al arrancar         | Otra instancia usando el puerto        | Detén el proceso anterior (`lsof -i :3000`)                 |
| El escáner VIDSRC falla          | vidsrc.me limita las peticiones        | Usa el escáner por rangos, con pausas                       |

Los errores internos nunca se envían al cliente: se registran en el servidor
con un `requestId` que también aparece en la respuesta, para poder correlacionar
un aviso de un usuario con la línea exacta del registro.

> GROUP BY imdb_id HAVING count(\*) > 1;
>
> ```
>
> Una vez resueltos (a mano o con la importación, que ya detecta el
> conflicto), basta con volver a aplicar la migración.
> ```

### Usuario administrador

El usuario se guarda en la tabla `cv_auth` con la contraseña en bcrypt:

```bash
# 1. Generar el hash
cd backend && node --input-type=module -e "import bcrypt from 'bcrypt'; console.log(await bcrypt.hash('TU_CONTRASEÑA', 10))"

# 2. Aplicarlo
psql "$DATABASE_URL" -f scripts/set-superadmin.sql -v username="'admin'" -v password="'<HASH>'"
```

> La contraseña debe tener al menos 10 caracteres, con minúscula, mayúscula y
> número. El panel de administración la valida en el servidor.

## 🔗 Sesión y CORS

- La sesión se guarda en una cookie `HttpOnly` (`cg_session`): el token no es
  accesible desde JavaScript, lo que reduce el impacto de un XSS.
- En despliegues de un solo dominio no hace falta configurar nada más.
- En despliegues cruzados: `CORS_ORIGINS` con el origen exacto,
  `COOKIE_SAME_SITE=none` y `COOKIE_SECURE=true`.
- El token también se acepta por cabecera `Authorization: Bearer <token>` para
  automatizaciones. **Nunca** se acepta por query string (`?token=`).

## ⚙️ CI/CD (GitHub Actions)

Existe una única ruta de despliegue: `.github/workflows/ci.yml`.

| Job       | Qué hace                                                             |
| --------- | -------------------------------------------------------------------- |
| `quality` | Prettier, y typecheck de raíz, frontend y backend                    |
| `test`    | Suite de pruebas (Vitest) contra un PostgreSQL efímero del runner    |
| `build`   | Build del frontend y del backend                                     |
| `deploy`  | Despliegue en Render (solo `push` a `main` del repositorio canónico) |

El despliegue **depende** de que las verificaciones anteriores terminen bien.
Los secretos se pasan como variables de entorno (no se interpolan en el
comando) y el trabajo de despliegue comprueba las condiciones del repositorio
para no publicar desde forks.

### Secrets requeridos en GitHub

| Secret                   | Descripción                                          |
| ------------------------ | ---------------------------------------------------- |
| `RENDER_API_KEY`         | API key de Render (Settings > API Keys)              |
| `RENDER_SERVICE_ID`      | ID del servicio (`render.com/services/srv-xxx`)      |
| `RENDER_DEPLOY_HOOK_URL` | Alternativa: deploy hook de Render                   |
| `RENDER_HEALTH_URL`      | URL pública de salud (por ejemplo `.../api/healthz`) |
| `TEST_TMDB_API_KEY`      | Opcional: habilita las pruebas de importación reales |

## 🩺 Comprobaciones de salud

- `GET /api/healthz` — el proceso responde (no consulta la base de datos).
- `GET /api/readyz` — el proceso puede atender tráfico (comprueba la BD).

Configura el health check de Render contra `/api/healthz` para el liveness
probe y contra `/api/readyz` para el readiness probe.

## 🧪 Pruebas en local

```bash
# Base de datos de pruebas aislada (nunca la de producción)
createdb cine-gratin-test

TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/cine-gratin-test pnpm test
```

Sin `TEST_DATABASE_URL` se ejecutan sólo las pruebas unitarias y las de
base de datos se omiten. Para probar también las importaciones reales:

```bash
TEST_TMDB_API_KEY=tu-clave-de-tmdb pnpm test
```

## 🔧 Recuperación ante errores

| Síntoma                          | Causa probable                         | Solución                                                    |
| -------------------------------- | -------------------------------------- | ----------------------------------------------------------- |
| El proceso no arranca            | Falta `JWT_SECRET` en producción       | Configura un secreto de 32+ caracteres                      |
| `401` en todo el panel           | Cookie no válida o `COOKIE_SECURE`     | Revisa `COOKIE_SAME_SITE`, `COOKIE_SECURE` y `CORS_ORIGINS` |
| El navegador no envía la cookie  | Dominios distintos sin `SameSite=None` | `COOKIE_SAME_SITE=none` + `COOKIE_SECURE=true`              |
| La importación no encuentra nada | `TMDB_API_KEY` no configurada          | Añádela a las variables de entorno                          |
| `EADDRINUSE` al arrancar         | Otra instancia usando el puerto        | Detén el proceso anterior (`lsof -i :3000`)                 |
| El escáner VIDSRC falla          | vidsrc.me limita las peticiones        | Usa el escáner por rangos, con pausas                       |

Los errores internos nunca se envían al cliente: se registran en el servidor
con un `requestId` que también aparece en la respuesta, para poder correlacionar
un aviso de un usuario con la línea exacta del registro.
