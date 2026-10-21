# Cine Gratin 🎬

Plataforma de streaming self-hosted con catálogo de películas, series, deportes y TV en vivo.

## Estructura del proyecto

```
cine-gratin/
├── frontend/          # App React + TypeScript + Vite + Tailwind
├── backend/           # API server Express + TypeScript
├── scripts/           # Utilidades (iconos PWA, validación de workflows, admin)
├── tests/             # Suite de pruebas (Vitest + supertest)
└── .github/           # CI/CD y templates
```

## Requisitos

- **Node.js** 20+
- **pnpm** 9.15.4 (la versión exacta está fijada en `package.json`)
- **PostgreSQL** 16+

## Desarrollo

```bash
# 1. Instalar dependencias (desde la raíz)
pnpm install

# 2. Configurar el entorno del backend
cp backend/.env.example backend/.env
#   Edita backend/.env: DATABASE_URL y un JWT_SECRET de 32+ caracteres

# 3. Crear el usuario administrador (ver DEPLOY.md)

# 4. Arrancar
pnpm dev:backend     # API en http://localhost:3000
pnpm dev:frontend    # Frontend en http://localhost:5173
```

El backend aplica las migraciones versionadas al arrancar, de modo que no hace
falta ejecutar ningún script de esquema por separado.

> En Windows, `pnpm install` y `pnpm dev:backend` usan sintaxis `sh`. Si tu
> consola no la soporta, configura Git Bash como shell de scripts:
> `npm config set script-shell "C:\Program Files\Git\bin\bash.exe"`.

## Verificaciones

```bash
pnpm lint:workflows  # Valida los workflows de GitHub Actions
pnpm format:check    # Prettier
pnpm typecheck       # TypeScript (raíz) + frontend + backend
pnpm test            # Suite de pruebas (Vitest)
pnpm build           # Build de producción
```

Las pruebas de base de datos usan una base **aislada**; nunca apuntan a la de
producción:

```bash
createdb cine-gratin-test
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/cine-gratin-test pnpm test
```

Sin `TEST_DATABASE_URL` se ejecutan solo las pruebas unitarias y las de base
de datos se omiten. `TEST_TMDB_API_KEY` habilita además las pruebas de
importación contra el proveedor real.

## Despliegue

El proyecto está preparado para desplegarse en **Render**. Ver
[`DEPLOY.md`](./DEPLOY.md) para las variables de entorno, las migraciones, el
proceso de autenticación y la recuperación ante errores.

## Arquitectura y seguridad

- **Sesión en cookie `HttpOnly`**: el token de administración no es accesible
  desde JavaScript (reduce el impacto de un XSS) y no se guarda en
  `localStorage`. El panel también acepta `Authorization: Bearer` para
  automatizaciones.
- **Protección CSRF**: las peticiones que cambian el estado y usan la cookie
  deben enviar la cabecera `X-CSRF-Token` (vinculada a la sesión) y llegar
  desde un origen permitido. Las peticiones con `Bearer` quedan exentas porque
  no usan credenciales ambientales.
- **Cierre de sesión real**: la sesión se revoca en el servidor, de modo que
  una copia del token deja de funcionar de inmediato.
- **Rutas administrativas cerradas por defecto**: sin sesión válida la API
  responde `401`; en producción nunca se acepta un token arbitrario.
- **Entrada validada con Zod** en todas las rutas de escritura, con límites de
  paginación, tamaño de cuerpo y longitud de campos.
- **Errores internos** se registran en el servidor con un `requestId` y nunca
  se envían al cliente.
- **Configuración validada al arrancar**: los valores fuera de rango, los
  secretos inseguros y las combinaciones incompatibles impiden el arranque.
- **Migraciones versionadas** con bloqueo distribuido (advisory lock) para que
  varias instancias puedan arrancar a la vez.
- **Catálogo consistente**: índices únicos parciales sobre `imdb_id` y
  `tmdb_id`; si ya hay duplicados, la migración no falla ni borra nada: registra
  el motivo en `schema_issues`.
- **Importaciones persistentes**: cada trabajo se guarda en `import_jobs`, se
  puede cancelar, reintentar sólo los fallidos y consultar su progreso aunque
  se cierre el navegador. Una importación en curso no bloquea la cola: el
  trabajo espera su turno.

## Características

- 🎥 Catálogo de películas y series con datos de TMDB
- 📺 TV en vivo con canales IPTV
- ⚽ Deportes y eventos en vivo
- 🔍 Búsqueda y filtros por género, año y orden (procesados en el servidor)
- 👤 Panel de administración con catálogo paginado, importaciones guiadas y
  tareas persistentes
- 📥 Importación desde YouTube y TMDB (manual, por lotes y automática)
- 📱 Diseño responsive, navegable por teclado y con soporte para
  `prefers-reduced-motion`
- 📦 Instalable como PWA con iconos y manifiesto válidos
- ⚡ Assets estáticos servidos precomprimidos (brotli/gzip) con caché inmutable
