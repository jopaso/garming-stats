# Garmin Stats

Panel personal para ver tus estadísticas de entrenamiento de Garmin Connect: actividades, mapas, zonas de FC, fitness (CTL/ATL/TSB), récords y más.

Los datos se descargan de tu cuenta de Garmin a archivos JSON. La app los lee desde ahí; no hay servidor en la nube ni base de datos de terceros.

---

## Despliegue en Raspberry Pi (Docker)

La forma recomendada: un contenedor que sirve la web y sincroniza Garmin **cada 15 minutos**. Accede desde el móvil o el portátil por **VPN** (WireGuard, Tailscale…); no abras el puerto en el router.

### Requisitos

| Qué | Notas |
| --- | --- |
| **Raspberry Pi OS 64 bits** | Necesario: la librería `garminconnect` no va bien en 32 bits |
| **Docker** + **Docker Compose** | [docs.docker.com/engine/install](https://docs.docker.com/engine/install/) |
| **Cuenta Garmin Connect** | La misma del móvil / [connect.garmin.com](https://connect.garmin.com) |
| **VPN** | Para abrir la app fuera de casa sin exponer el puerto |

### Pasos

1. Clona el repo en la Pi y entra en la carpeta:

```bash
git clone https://github.com/RafaTatay/garming-stats.git
cd garming-stats
```

2. Crea el archivo de credenciales (nunca lo subas a git):

```bash
cp .env.example .env
```

Edita `.env` y pon tu email y contraseña de Garmin Connect:

```
GARMIN_EMAIL=tu@email.com
GARMIN_PASSWORD=tu_contraseña
```

3. Construye y arranca:

```bash
docker compose up -d --build
```

La primera sincronización puede tardar varios minutos. Las siguientes solo piden actividades nuevas.

4. Conéctate a tu VPN y abre en el navegador:

```
http://<ip-de-la-pi>:8787
```

(Sustituye `<ip-de-la-pi>` por la IP de la Raspberry en la VPN.)

### Comandos útiles en la Pi

```bash
# Ver logs (sync + servidor web)
docker compose logs -f

# Parar
docker compose down

# Reconstruir tras actualizar el código
git pull
docker compose up -d --build
```

Los JSON viven en **`public/data/`** del propio proyecto (bind mount). Si ya sincronizaste en el PC y copiaste esa carpeta a la Pi, Docker la usa tal cual.

La sesión de Garmin se guarda en `data/garth/` (también en el disco de la Pi).

El intervalo de sync se controla con `SYNC_INTERVAL_SECONDS` (por defecto `900` = 15 minutos) en `docker-compose.yml`.

Si el sync falla con `Could not resolve host: sso.garmin.com`, el compose ya fija DNS a `1.1.1.1` / `8.8.8.8`. Recrea el contenedor: `docker compose up -d --force-recreate`.

---

## Desarrollo local (sin Docker)

Útil en el PC mientras programas. Necesitas **Node.js 18+** y **Python 3.10+**.

### 1. Credenciales

```bash
cp .env.example .env
# Edita GARMIN_EMAIL y GARMIN_PASSWORD
```

### 2. Dependencias de Python

```bash
cd fetch
python3 -m pip install -r requirements.txt
cd ..
```

### 3. Descargar actividades

```bash
# Todas (o solo las nuevas si ya hay datos en public/data/)
python3 fetch/sync.py

# Solo las 20 más recientes (prueba)
python3 fetch/sync.py --limit 20

# Solo desde una fecha
python3 fetch/sync.py --since 2024-01-01

# Sin rutas GPS (más rápido)
python3 fetch/sync.py --no-gpx
```

### 4. App web en modo desarrollo

```bash
npm install
npm run dev
```

Abre la URL que muestre Vite (por ejemplo [http://localhost:5173](http://localhost:5173)).

### Resumen rápido en local

```bash
python3 fetch/sync.py
npm run dev
```

### Servir el build de producción en local

```bash
npm run build
python3 fetch/serve.py
```

Abre [http://localhost:8787](http://localhost:8787).

---

## Ajustes dentro de la app

En el menú lateral, entra en **Ajustes** para configurar:

- FC máxima
- FTP (ciclismo)
- FC y ritmo en umbral (running)

Estos valores se guardan en tu navegador (`localStorage`) y afectan a los cálculos de zonas, TSS y fitness.

La lista de actividades se refresca sola cuando termina una sincronización en segundo plano (cada minuto comprueba si cambió `stats.json`).

---

## Problemas frecuentes

### "ERROR: Set GARMIN_EMAIL and GARMIN_PASSWORD in .env"

No existe el archivo `.env` o está vacío. Copia `.env.example` y rellénalo.

### "Authentication failed" al sincronizar

- Comprueba email y contraseña.
- Si tienes 2FA en Garmin, el login automático puede fallar. Prueba a desactivarla temporalmente o revisa la documentación de `garminconnect`.

### "Sin datos de Garmin" / no aparecen actividades

1. Comprueba que en la Pi exista `public/data/activities.json` (la carpeta que copiaste del PC).
2. Recrea el contenedor para montar esa carpeta: `docker compose up -d --force-recreate`.
3. Mira los logs: `docker compose logs -f`.
4. Si el sync falla con DNS (`Could not resolve host: sso.garmin.com`), el compose ya usa DNS públicos; reinicia Docker o la Pi si sigue fallando.
5. Tras actualizar el código: `git pull && docker compose up -d --build`.

### `Could not resolve host: sso.garmin.com`

El contenedor no resuelve DNS (frecuente en Raspberry Pi). El `docker-compose.yml` fija `1.1.1.1` y `8.8.8.8`. Aplica con:

```bash
docker compose up -d --force-recreate
```

Si sigue igual, prueba en el host: `ping sso.garmin.com`. Si el host tampoco resuelve, el problema es la red/DNS de la Pi, no de la app.

### La sincronización va muy lenta

Es normal: hay pausas entre peticiones para no saturar la API de Garmin. En local, para una prueba usa `--limit 20` o `--no-gpx`.

### Docker no arranca en la Pi / error con curl_cffi

Usa **Raspberry Pi OS de 64 bits**. En 32 bits las ruedas de `curl_cffi` suelen faltar.

### Puerto 8787 o 5173 ya en uso

Cierra el otro proceso que lo esté usando, o cambia `PORT` / el mapeo en `docker-compose.yml`.

---

## Comandos extra (opcional)


| Comando           | Descripción                                                |
| ----------------- | ---------------------------------------------------------- |
| `npm run build`   | Genera la versión optimizada en `dist/`                    |
| `npm run preview` | Previsualiza la build con Vite                             |
| `npm run lint`    | Revisa el código con el linter                             |
| `python3 fetch/serve.py` | Sirve `dist/` + `public/data/` en el puerto 8787    |


---

## Estructura del proyecto (referencia)

```
garmin-stats/
├── .env                 ← Credenciales (no compartir)
├── Dockerfile
├── docker-compose.yml
├── fetch/
│   ├── sync.py          ← Descarga datos de Garmin
│   ├── serve.py         ← Sirve la web + JSON en vivo
│   ├── entrypoint.sh    ← Sync periódico + servidor (Docker)
│   └── requirements.txt
├── public/data/         ← JSON descargados (volumen en Docker)
└── src/                 ← App web (React)
```

---

## Privacidad y qué NO subir a GitHub

Estos archivos contienen datos personales o credenciales. El `.gitignore` ya los excluye, pero conviene conocerlos:

| Archivo / carpeta | Qué contiene | Riesgo |
|-------------------|--------------|--------|
| `.env` | Email y contraseña de Garmin Connect | Acceso total a tu cuenta |
| `public/data/` | Actividades, estadísticas y rutas GPS | Ubicación exacta, salud, hábitos |
| `dist/data/` | Copia de los datos al hacer `npm run build` | Igual que arriba |
| `~/.garth/` (o el volumen `garmin-garth`) | Tokens de sesión de Garmin | Acceso a la API sin contraseña |

**Datos sensibles dentro de los JSON:**

- Coordenadas GPS de cada entrenamiento (pueden revelar dónde vives o entrenas)
- Ciudades en los títulos de actividades
- FC, VO2max, calorías, ritmos y patrones horarios

**Seguro para publicar:**

- `.env.example` (solo tiene placeholders)
- Todo el código en `src/` y `fetch/`

**Antes de hacer `git push`**, comprueba que no se cuelen datos:

```bash
git status
```

No deberían aparecer `.env` ni archivos dentro de `public/data/`. Si alguna vez los añadiste por error:

```bash
git rm -r --cached public/data/
git rm --cached .env
```

Luego haz commit de la eliminación. Si ya los subiste a GitHub, **cambia tu contraseña de Garmin** y considera borrar el historial del repositorio.
