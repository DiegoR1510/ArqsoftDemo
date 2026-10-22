# Guion de demo KIPU — 5 minutos

## Preparar desde un clon limpio

```text
npm ci
npm run build
npm test
npm start
```

Abrir http://localhost:3000. `npm start` activa `DEMO_MODE=true`; la puerta evita que las palancas y seeds de demo estén disponibles sin esa variable. Usuarios demo: `demo-creator-1` y `demo-creator-2`, ambos con rol `CREATOR`.

## Guion

| Tiempo | Acción | Qué demuestra |
|---|---|---|
| 0:00–0:45 | Seleccionar `demo-creator-1` y abrir Feed. | M1: JWT, identidad demo y gateway como única entrada. El feed muestra anuncios, versión de reglas y tarjetas. |
| 0:45–1:30 | Abrir Publicar, usar título `Video [revision]` y observar la línea de estados. | M2: pipeline separado, moderación determinista y falla segura: permanece en `MODERATING`, no publica ni habilita playback. |
| 1:30–2:15 | Volver a Feed, pulsar Me gusta y comentar desde el otro usuario; abrir Notificaciones. | M4: eventos desacoplados, like idempotente y notificación creada por el worker. |
| 2:15–3:15 | Abrir Demo / Arquitectura y activar “Tumbar ranking”. Volver a Feed. | M3: degradación controlada; el feed sigue respondiendo con `degraded:true`. Recuperar el ranking. |
| 3:15–4:00 | Activar “Ad-server lento (120 ms)” y volver al Feed. | M3: timeout de 80 ms; la posición del anuncio se rellena con orgánico y sube `ad_fallbacks`. Normalizar. |
| 4:00–4:35 | Cambiar `rk-2026.10.json` a `rk-2026.11.json` y volver al Feed. | M3: reglas versionadas y cambio en caliente sin reiniciar. |
| 4:35–5:00 | Revisar health, eventos y dead-letters; ejecutar `npm run smoke` si se quiere repetir el flujo. | Tácticas visibles: salud, bus, reentrega, dead-letter y separación de servicios. M5 permanece simulada. |

## Extensión opcional: API Management

Entra como `demo-creator-1`, abre «API Management» y prueba las tarjetas «Acceso público», «Feed» y «Subida de videos». Cada una envía solicitudes de demo sometidas a la misma política que su ruta real hasta obtener `429`; no crea cuentas ni videos. La tabla muestra solicitudes y latencias HTTP medidas desde el arranque: las filas `DEMO` identifican las pruebas y las otras filas corresponden al tráfico real. Feed y uploads tienen cuotas independientes por usuario; acceso público se limita por IP. El tiempo de reintento llega en `Retry-After`. La ventana y métricas en memoria son deliberadamente locales, no una garantía de producción.

## Marcas de publicación

- Sin marca: `PUBLISHED`.
- `[revision]`: `MODERATING`.
- `[rechazo]`: `REJECTED`.
- `[timeout]`: `MODERATING` sin publicación.
- `[fallo-transcode]`: reintentos del worker y dead-letter.

## Cobertura final

| Módulo | Completos en la demo | Parciales | Diferidos / motivo |
|---|---|---|---|
| M1 Identidad | Registro, OTP de desarrollo, JWT, roles y gateway | Persistencia y revocación duradera | Producción, MFA y almacenamiento durable |
| M2 Media | MP4 pequeño, metadatos, estados, transcode simulado, moderación, borrado y playback firmado | Revisión manual simulada; URL local | HLS, CDN, thumbnails, almacenamiento distribuido y SLO |
| M3 Feed | Proyección de publicados, ranking JSON, búsqueda, cursor, fallback y anuncios con timeout | Cursor numérico y ranking básico | Cursor opaco RF-M3-02, tendencias, Bloom filter, “no me interesa” y escala |
| M4 Social | Follow/unfollow, like idempotente, comentarios, bloqueo y bandeja por eventos | Comentarios de un nivel; notificación simple | Hilos completos RF-M4-03, agrupación, push y chat |
| M5 | Simulada mediante `dependency-stubs` y palancas del panel | — | No hay ad-server real, CDN ni integración externa de producción |

Las simplificaciones parciales no se presentan como cumplimiento total. La tabla completa de decisiones está en [DECISIONES.md](./DECISIONES.md).
