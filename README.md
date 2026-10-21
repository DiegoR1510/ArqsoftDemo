# KIPU — Prototipo funcional

Prototipo académico de M1 (Identidad), M3 (Feed y búsqueda) y M4 (Social y notificaciones).

## Estado del paso 1

Base ejecutable: ocho procesos NestJS, una UI Next.js de diagnóstico, salud HTTP y supervisor local.
Los endpoints de negocio, autenticación, bus de eventos, almacenes, ranking y notificaciones aún están **diferidos**.
`referencia/` es la fuente de verdad en solo lectura. Los recortes y su relación con RF, tácticas y ADR están en `DECISIONES.md`.

## Requisitos

- Node **20.20.2** (`.nvmrc`) y npm **10.x**. El proyecto verifica Node al compilar, probar y arrancar.
- Git, para consultar los commits. Sin Docker, bases externas ni servicios en nube.
- Puertos libres: 3000, 4000, 4001, 4003, 4004, 4010, 4011, 4012 y 4020.

Si usas nvm, selecciona primero la versión:

```sh
nvm install 20.20.2
nvm use 20.20.2
node --version
npm --version
```

Se espera `v20.20.2` y una versión npm `10.x`. Si tu instalación trae otra versión de npm, ejecuta `npm install --global npm@10.9.9`.

## Instalar y comprobar

Desde la raíz de `kipu-prototipo`:

```sh
npm ci
npm run build
npm test
```

`npm ci` utiliza el lockfile. `npm run build` compila paquetes y servicios con TypeScript y luego construye Next.js.
`npm test` requiere esa compilación previa: comprueba límites de importación, inicia procesos reales, prueba su salud y la página web, y los detiene al terminar.
**Ejecuta las pruebas con KIPU detenido**, porque usan los mismos puertos. Si vuelves a editar código, recompila antes de probar.

## Levantar todo con un solo comando

```sh
npm start
```

Espera el mensaje:

```text
KIPU_READY http://localhost:3000 — Ctrl+C o npm run stop
```

Abre **http://localhost:3000**. La pantalla consulta al gateway cada cinco segundos y debe mostrar **9 / 9 disponibles**.
La página es un diagnóstico de infraestructura del paso 1; todavía no contiene funciones de la red social.

## Detener todo

En la terminal de arranque pulsa **Ctrl+C**, o en una segunda terminal, desde esta raíz:

```sh
npm run stop
```

El supervisor envía la señal de parada a sus hijos, espera su salida y libera los puertos. Una segunda parada es inocua.
Los scripts usan Node y no requieren Bash, `killall`, `concurrently` ni utilidades de procesos de terceros.
En el paso 1, si un hijo termina inesperadamente, el supervisor detiene al resto para evitar procesos huérfanos. La demostración de degradación del paso 8 modificará este comportamiento de forma explícita.
El estado de ejecución se guarda temporalmente en `.run/` y no se versiona. No borres esa carpeta mientras esté ejecutándose.

## Puertos y salud

Todos los procesos escuchan en `127.0.0.1`. Son puertos locales de demostración, no servicios publicados en internet.

| Aplicación | Puerto | Salud |
|---|---:|---|
| `kipu-web` | 3000 | `http://localhost:3000/health` |
| `api-gateway` | 4000 | `http://localhost:4000/health` |
| `identity-service` | 4001 | `http://localhost:4001/health` |
| `feed-service` | 4003 | `http://localhost:4003/health` |
| `social-service` | 4004 | `http://localhost:4004/health` |
| `event-bus` | 4010 | `http://localhost:4010/health` |
| `ranking-service` | 4011 | `http://localhost:4011/health` |
| `notification-worker` | 4012 | `http://localhost:4012/health` |
| `dependency-stubs` | 4020 | `http://localhost:4020/health` |

Ejemplos (en Windows PowerShell puedes usar `curl.exe`):

```sh
curl -s http://localhost:4000/health
# {"service":"api-gateway","status":"ok"}
curl -s http://localhost:4001/health
# {"service":"identity-service","status":"ok"}
curl -s http://localhost:4000/health/services
```

La última consulta contiene nueve entradas con `service`, `port` y `status` (`ok` o `unavailable`).
`/health` verifica que el proceso responde; no demuestra cumplimiento de requisitos de negocio ni alta disponibilidad.
La única API adicional de este paso, `/health/services`, es diagnóstico local de lectura. No modifica ni inicia ni detiene servicios.

## Organización

- `apps/`: aplicaciones independientes. Cada backend tiene `main.ts`, `app.module.ts` y `health.controller.ts` en `src/`.
- `packages/contracts/`: contratos técnicos y catálogo inmutable de nombres y puertos; sin datos de negocio.
- `packages/observability/`: logs JSON de arranque y error; todavía sin trazas de peticiones.
- `packages/auth/` y `packages/events/`: carpetas reservadas; sin implementación ni dependencias.
- `scripts/`: build, verificación de Node, arranque conjunto y parada.
- `tests/`: pruebas de arquitectura y de integración HTTP con procesos reales.
- `referencia/`: documentos e imágenes originales, sin modificaciones.

Una aplicación nunca importa código de otra aplicación. Solo puede compartir contratos y utilidades de `packages/`.
La UI consulta el estado a través del gateway, nunca directamente a cada backend desde el navegador.

## Dependencias utilizadas

- NestJS (`common`, `core`, `platform-express`), `reflect-metadata` y RxJS: servidores HTTP y runtime de Nest.
- Next.js, React y React DOM: UI y su endpoint de salud.
- TypeScript y tipos de Node/React: compilación estricta y comprobación de tipos.
- Las pruebas, el supervisor, las peticiones HTTP y los temporizadores usan módulos de Node.

No se instalaron librerías de JWT, eventos, bases de datos, ranking, WebSocket ni reproducción de video en este paso.

## Siguientes pasos sujetos a aprobación

2. Bus de eventos local; 3. M1 y gateway; 4. Feed y búsqueda; 5. Social e integración;
6. Notificaciones; 7a. UI de identidad y feed; 7b. UI de búsqueda, comentarios y notificaciones;
8. Resiliencia, reglas versionadas, «No me interesa» y panel de demostración.
