# KIPU — prototipo local

Demo funcional de identidad, media, bus de eventos, feed, social, notificaciones y UI. Todo es local, en memoria o almacenamiento privado de demo; no representa SLO de producción.

## Instalación y arranque

Requiere Node 20.20.2 y npm 10.x.

```text
npm ci
npm run build
npm test
npm start
```

`npm start` activa `DEMO_MODE=true` por defecto. Para probar la puerta apagada, inicia servicios con `DEMO_MODE=false`; las rutas `/v1/auth/demo/*` y `/v1/demo/*` responden 404.

Solo para uso local: este arranque usa secretos de desarrollo y datos en memoria. No expongas sus puertos a Internet ni lo despliegues como servicio de producción sin configurar secretos propios y desactivar `DEMO_MODE`.

Abre http://localhost:3000. Para detener: `npm run stop`.

## Árbol

```text
apps/
  api-gateway/          entrada única HTTP, cuota JWT y puerta de demo
  identity-service/     usuarios, OTP y JWT
  media-service/        uploads, estados, moderación y playback
  transcode-worker/     cola de transcodificación simulada
  event-bus/            eventos, reentrega y dead-letter
  feed-service/         feed, ranking y búsqueda
  social-service/       follows, likes, comentarios y bloqueo
  notification-worker/  bandeja por eventos
  ranking-service/      reglas JSON versionadas
  dependency-stubs/     ad-server falso
  kipu-web/             UI Next.js de una página
packages/               contratos, auth, eventos y utilidades
tests/                  pruebas de tácticas y flujos principales
```

## Puertos

| Aplicación | Puerto |
|---|---:|
| kipu-web | 3000 |
| api-gateway | 4000 |
| identity-service | 4001 |
| media-service | 4002 |
| feed-service | 4003 |
| social-service | 4004 |
| event-bus | 4010 |
| ranking-service | 4011 |
| notification-worker | 4012 |
| transcode-worker | 4013 |
| dependency-stubs | 4020 |

## Comandos de demo

```text
npm run seed
npm run smoke
```

El seed y el smoke son herramientas locales de demostración. El guion completo y la cobertura están en [DEMO.md](./DEMO.md). Las decisiones y simplificaciones están en [DECISIONES.md](./DECISIONES.md).

Para mostrar API Management, entra como un creador demo, abre la pestaña «API Management» y prueba una de las tres tarjetas: acceso público (10 peticiones/IP/minuto), feed (60 peticiones/usuario/10 s) o subida de videos (20 peticiones/usuario/minuto). El gateway devuelve `429` al agotar cada cuota y la página muestra el tiempo de reintento. La tabla contiene mediciones HTTP reales desde el arranque; las solicitudes de prueba se distinguen con `DEMO`. `GET /v1/demo/api-management` responde `404` sin `DEMO_MODE=true`. Las cuotas y métricas son locales y se reinician al parar.
