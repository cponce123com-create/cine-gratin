# API de Cine Gratin

## 📡 Endpoints

### Salud

| Método | Endpoint       | Descripción               |
| ------ | -------------- | ------------------------- |
| GET    | `/api/healthz` | Health check del servidor |

### Películas

| Método | Endpoint                | Descripción                       | Parámetros               |
| ------ | ----------------------- | --------------------------------- | ------------------------ |
| GET    | `/api/movies`           | Listar películas                  | `page`, `limit`, `genre` |
| GET    | `/api/movies/trending`  | Películas trending                | `limit`                  |
| GET    | `/api/movies/search`    | Buscar películas                  | `q`, `page`, `limit`     |
| GET    | `/api/movies/:id`       | Detalles de película              | `id` (path)              |
| PATCH  | `/api/movies/:id/view`  | Incrementar vistas                | `id` (path)              |
| POST   | `/api/admin/movies`     | Crear/actualizar película (Admin) | Body                     |
| DELETE | `/api/admin/movies/:id` | Eliminar película (Admin)         | `id` (path)              |

### Series

| Método | Endpoint                | Descripción                    | Parámetros               |
| ------ | ----------------------- | ------------------------------ | ------------------------ |
| GET    | `/api/series`           | Listar series                  | `page`, `limit`, `genre` |
| GET    | `/api/series/trending`  | Series trending                | `limit`                  |
| GET    | `/api/series/search`    | Buscar series                  | `q`, `page`, `limit`     |
| GET    | `/api/series/:id`       | Detalles de serie              | `id` (path)              |
| PATCH  | `/api/series/:id/view`  | Incrementar vistas             | `id` (path)              |
| POST   | `/api/admin/series`     | Crear/actualizar serie (Admin) | Body                     |
| DELETE | `/api/admin/series/:id` | Eliminar serie (Admin)         | `id` (path)              |

### Sagas (Colecciones)

| Método | Endpoint                             | Descripción               |
| ------ | ------------------------------------ | ------------------------- |
| GET    | `/api/sagas`                         | Listar sagas              |
| GET    | `/api/sagas/:id`                     | Detalles de saga          |
| GET    | `/api/admin/sagas`                   | Listar sagas (Admin)      |
| POST   | `/api/admin/sagas`                   | Crear saga (Admin)        |
| POST   | `/api/admin/sagas/backfill-tmdb-ids` | Backfill TMDB IDs (Admin) |
| DELETE | `/api/admin/sagas/:collection_id`    | Eliminar saga (Admin)     |

### Eventos (YouTube)

| Método | Endpoint                        | Descripción              |
| ------ | ------------------------------- | ------------------------ |
| GET    | `/api/events`                   | Listar eventos en vivo   |
| GET    | `/api/events/settings`          | Obtener configuración    |
| POST   | `/api/events/settings`          | Actualizar configuración |
| GET    | `/api/events/channels`          | Listar canales           |
| POST   | `/api/events/channels`          | Agregar canal            |
| DELETE | `/api/events/channels/:id`      | Eliminar canal           |
| POST   | `/api/events/channels/:id/sync` | Sincronizar canal        |
| POST   | `/api/events/sync-all`          | Sincronizar todos        |
| DELETE | `/api/events/:id`               | Eliminar evento          |

### Deportes

| Método | Endpoint                        | Descripción              |
| ------ | ------------------------------- | ------------------------ |
| GET    | `/api/sports/matches`           | Listar partidos          |
| GET    | `/api/sports/settings`          | Obtener configuración    |
| POST   | `/api/sports/settings`          | Actualizar configuración |
| GET    | `/api/sports/channels`          | Listar canales           |
| POST   | `/api/sports/channels`          | Agregar canal            |
| DELETE | `/api/sports/channels/:id`      | Eliminar canal           |
| POST   | `/api/sports/channels/:id/sync` | Sincronizar canal        |
| POST   | `/api/sports/sync-all`          | Sincronizar todos        |
| DELETE | `/api/sports/matches/:id`       | Eliminar partido         |

### Descargas

| Método | Endpoint        | Descripción     | Parámetros      |
| ------ | --------------- | --------------- | --------------- |
| GET    | `/api/download` | Descargar video | `url`, `format` |

### TMDB

| Método | Endpoint      | Descripción                  |
| ------ | ------------- | ---------------------------- |
| GET    | `/api/tmdb/*` | Proxy a TMDB API (protegido) |

### Administración

| Método | Endpoint                 | Descripción                |
| ------ | ------------------------ | -------------------------- |
| POST   | `/api/admin/login`       | Iniciar sesión             |
| GET    | `/api/admin/me`          | Perfil del admin           |
| GET    | `/api/admin/stats`       | Estadísticas del dashboard |
| GET    | `/api/admin/import-logs` | Logs de importación        |

## 📦 Ejemplos

### Listar películas

```bash
curl -X GET "https://tu-backend.onrender.com/api/movies?page=1&limit=10"
```

```json
{
  "data": [
    {
      "id": 1,
      "title": "Inception",
      "year": 2010,
      "poster": "https://image.tmdb.org/...",
      "rating": 8.8
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 10
}
```

### Buscar series

```bash
curl -X GET "https://tu-backend.onrender.com/api/series/search?q=breaking+bad"
```

### Crear película (Admin)

```bash
curl -X POST "https://tu-backend.onrender.com/api/admin/movies"
  -H "Authorization: Bearer <token>"
  -H "Content-Type: application/json"
  -d '{
    "title": "Mi Película",
    "year": 2024,
    "genre": "Acción",
    "video_url": "https://..."
  }'
```
