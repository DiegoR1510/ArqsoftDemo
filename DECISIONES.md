# Decisiones del prototipo KIPU

## D-14 — Reordenamiento e implementación incremental de M2

- **Decisión:** después del Paso 3, M2 se divide en **4a media-service** y **4b transcode-worker**. Los pasos anteriores 4 a 8 pasan a ser 5 a 9; no se cambia el orden lógico de feed, social, notificaciones, UI y resiliencia.
- **4a:** `media-service` usa el puerto 4002, almacén privado local ignorado por Git, MP4 pequeño en base64 para la demostración, metadatos, estados, autorización `CREATOR`, eliminación por dueño o `MODERATOR` y playback firmado por 5 minutos.
- **4b pendiente:** un worker separado añadirá cola, reintentos, idempotencia, moderación simulada con falla segura y `video.published` después de procesar y moderar.
- **Alternativa descartada:** afirmar en 4a que existe S3, multipart reanudable, FFmpeg, HLS, CDN, clasificación real o los SLO de producción de M2.
- **Cobertura:** RF-M2-11 queda parcial porque se implementa eliminación lógica, pero no edición, borrado físico a 30 días ni retenciones. Los demás estados de cobertura de la propuesta M2 se mantienen.

## D-13 — Paso 3: identidad local y gateway protegido

- **Decisión:** implementar M1 como sustituto local autocontenido: OTP de desarrollo, JWT HMAC de 15 minutos, refresh token rotativo de 30 días, roles básicos, perfiles en memoria y gateway como único punto de entrada para las rutas de negocio.
- **Alternativa descartada:** incorporar Keycloak, Google/Apple, Redis y PostgreSQL en este prototipo.
- **Motivo:** demostrar el contrato y el flujo de autorización sin infraestructura externa. La firma y la autorización son reales dentro de esta ejecución, pero no equivalen a seguridad de producción.
- **Cobertura:** registro, OTP, token, refresh, introspección, perfil y guard del gateway quedan implementados; federación OIDC, 2FA, sesiones persistentes, derechos ARCO, marca, equipos, suspensión completa y auditoría durable quedan parciales o diferidos.
- **Referencia:** ADR-M1-01/02/03 y T-M1-01 a 05. `@kipu/auth` contiene utilidades compartidas; no contiene cuentas ni estado de identidad.

## D-12 — Ampliación de alcance a M2 (documentación; implementación pendiente)

- **Decisión:** incluir M2 Contenido en el alcance y conservar M5 como stubs, por instrucción del usuario. Se incorporan los cuatro documentos originales de M2 sin alterar su contenido.
- **Alternativa descartada:** mantener M2 excluido y resolver todo su catálogo mediante stubs.
- **Motivo:** preparar un ciclo de contenido propio e integración por eventos. La exclusión de M2 de D-09 queda sustituida; los recortes técnicos nuevos son propuestas, no decisiones aprobadas.
- **Táctica / ADR:** ADR-M2-01/02/03 y T-M2-01 a 05. La [propuesta M2](PROPUESTA-M2.md) queda pendiente para después de terminar y aprobar los pasos 2 y 3. No se implementa ningún RF-M2 en este cambio.

## Paso 2: bus de eventos local

### D-10 — Bus local con confirmación, reentrega y grupos independientes

- **Decisión:** `apps/event-bus` mantiene en memoria la cola, el cursor de cada grupo, la entrega pendiente y la cola de dead-letter. Una confirmación vence a los 250 ms; una entrega se intenta como máximo 3 veces y luego se consulta en `GET /debug/dead-letters`. Cada grupo avanza su cursor de forma independiente.
- **Alternativa descartada:** poner la cola o los cursores en `packages/events`, o compartir un singleton entre aplicaciones.
- **Motivo:** `packages/events` queda limitado a contratos, cliente y deduplicación; el bus conserva la propiedad de su estado y permite demostrar entrega al menos una vez sin infraestructura externa.
- **Táctica / referencia:** entrega al menos una vez y confirmación de offset de ADR-M4-03/T-M4-03; la persistencia y replicación Kafka quedan fuera del prototipo.

### D-11 — Nombre del evento de reacciones

- **Decisión:** se conserva `social.liked`, que es el nombre de RF-M4-12 y de la lista de eventos publicados.
- **Discrepancia:** T-M4-06 menciona `social.reacted` como nombre genérico para el tipo de reacción.
- **Alternativa descartada:** publicar ambos nombres para un mismo like.
- **Motivo:** dos eventos duplicarían efectos y harían ambiguo el contrato. Si en un paso posterior se amplían reacciones, `social.reacted` podría representar un catálogo tipado, pero no se introduce ahora.

## Estado y forma de registro

**Paso 1: base ejecutable.** Ningún RF de negocio está completo todavía.
Las decisiones D-01 a D-04 se aplican en este paso; las siguientes registran el alcance aprobado para pasos futuros y no se presentan como implementadas.
`referencia/` conserva íntegramente la documentación original.

## D-01 — Procesos independientes y monorepo

- **Decisión:** una aplicación NestJS por servicio previsto y una UI Next.js. Gateway 4000, identidad 4001, feed 4003, social 4004, bus 4010, ranking 4011, notificaciones 4012, stubs 4020, UI 3000. Cada servicio sigue controller → service → repository/client cuando esas capas sean necesarias; el paso 1 solo usa controller.
- **Alternativa descartada:** un único servidor con todos los módulos en el mismo proceso.
- **Motivo:** poder aislar y observar procesos; especialmente ranking y notificaciones. Los almacenes propios llegarán con cada módulo; no existe estado de negocio compartido en paquetes.
- **Referencia:** 6.3; ADR-M3-02, ADR-M4-04. Chat/realtime queda diferido, así que no se crea ese proceso.

## D-02 — Paquetes compartidos sin acceso entre aplicaciones

- **Decisión:** contratos técnicos en `@kipu/contracts` y logs de ciclo de vida en `@kipu/observability`. Se reservan `packages/auth` y `packages/events` con README únicamente. Una prueba inspecciona imports y rechaza dependencias hacia otras aplicaciones.
- **Alternativa descartada:** importar clases, repositorios o datos internos de una aplicación desde otra.
- **Motivo:** mantener límites claros y permitir cambios independientes. Compartir un contrato no equivale a compartir datos.
- **Referencia:** principio de AGENTS.md; interfaz `AuthProvider` de ADR-M1-01 y contratos `@kipu/events` de ADR-M4-03.

## D-03 — Supervisor local y versiones reproducibles

- **Decisión:** Node 20.20.2, npm 10.x, TypeScript estricto, lockfile npm, scripts Node sin librerías externas para supervisar procesos. Backend NestJS 11.2.7 y UI Next.js 15.5.28 con React 19.1.10. Versiones consultadas en el registro npm al preparar el paso. La compilación Next usa un worker (`experimental.cpus=1`) para limitar recursos locales; esto no es una decisión de escalado del producto.
- **Alternativa descartada:** Docker, gestores de procesos adicionales o ejecutar varios npm anidados desde el supervisor.
- **Motivo:** un solo comando de arranque/parada, menos dependencias y procesos hijos controlables tanto desde Ctrl+C como desde `npm run stop`. Si hay puertos ocupados, se rechaza el inicio sin cerrar procesos ajenos.
- **Referencia:** stack y restricciones del prototipo en AGENTS.md.
- **Límite actual:** el supervisor del paso 1 detiene el conjunto si un hijo muere. El paso 8 habilitará la demostración de fallas aisladas y recuperación; este comportamiento actual no se presenta como degradación controlada.

## D-04 — Salud de procesos y UI de diagnóstico

- **Decisión:** cada aplicación expone `GET /health` con `{service,status:"ok"}`. El gateway agrega estados por HTTP en `GET /health/services`; la UI consulta únicamente al gateway cada 5 s. Son rutas técnicas locales, añadidas por no estar especificadas en referencia. Todos escuchan en la interfaz de loopback.
- **Alternativa descartada:** mostrar estados codificados como disponibles o dejar que el navegador consulte todos los servicios.
- **Motivo:** comprobar procesos reales manteniendo el gateway como entrada a la API. El agregado distingue procesos no disponibles sin alterar su estado.
- **Referencia:** 6.3 y principio de API Gateway de AGENTS.md.
- **Límite:** es liveness; no acredita funciones de negocio, validación JWT, rate limit, persistencia ni SLO de producción.

## D-05 — Identidad local como sustitución explícita (aprobada, pendiente)

- **Decisión:** en el paso 3 se implementará un `AuthProvider` local, OTP de desarrollo visible solo en consola y JWT firmado realmente. Sustituye en el prototipo a Keycloak, Google/Apple y SMS/correo. Se mantendrán los roles y endpoints de RF-M1.
- **Alternativa descartada:** instalar Keycloak o integrar proveedores reales ahora.
- **Motivo:** demostración autocontenida sin infraestructura externa; la interfaz preservará la posibilidad de otro adaptador.
- **Referencia:** ADR-M1-01/02; RF-M1-01/02/03/07; ESC-M1-06. La federación real de RF-M1-02 queda diferida.
- **2FA:** RF-M1-10 diferido. Esto afecta el 2FA obligatorio de BRAND_OWNER, MODERATOR, ADMIN y FINANCE, aunque su activación opcional figure en una HU Media. Los actores privilegiados serán datos de demostración; no se afirmará cumplimiento completo de seguridad.

## D-06 — Sustitutos en memoria con estado propio (aprobada, pendiente)

- **Decisión:** repositorios, cachés y búsqueda en memoria detrás de interfaces; bus en proceso separado con publicación/consumo/confirmación por transporte local. Mantendrá `event_id`, `idempotency_key` y `trace_id`; reintentará entregas no confirmadas y cada consumidor deduplicará.
- **Alternativa descartada:** Postgres, Redis, Kafka y OpenSearch reales, o un singleton compartido entre aplicaciones.
- **Motivo:** demostrar desacoplamiento y entrega al menos una vez dentro de una ejecución sin infraestructura externa.
- **Referencia:** ADR-M3-03/04, ADR-M4-03/05, T-M4-03.
- **Límite:** los datos y eventos se pierden al reiniciar su proceso. No se demuestra durabilidad ni replicación Kafka ni «0 eventos perdidos» ante caída del bus. Una proyección pública local se obtiene por eventos, no leyendo repositorios ajenos.

## D-07 — Alcance de M3 y ambigüedades (aprobada, pendiente)

- **Decisión:** feed y ranking separados, reglas configurables, catálogo de prueba pequeño y búsqueda básica. En el paso 8 se incluyen RF-M3-05 («No me interesa»), respaldo con circuit breaker, timeout de anuncios, cambio/reversión de reglas y panel de demostración.
- **Alternativa descartada:** algoritmo ML, búsqueda completa de producción y catálogo masivo.
- **Motivo:** conservar las decisiones arquitectónicas demostrables. Las duraciones y métricas locales se medirán sin afirmar escala de producción.
- **Referencia:** RF-M3-01/05/06/09/11/13; T-M3-01/03/04/05.
- **Tiempos:** la referencia combina presupuesto nominal de ranking de 70 ms con cortes de 110/130 ms y anuncio de 80 ms. El anuncio no puede garantizar literalmente «0 ms adicional» solo por ejecutarse en paralelo. En el paso 8 se documentará el presupuesto efectivo y se medirá la respuesta, sin prometer equivalencia automática con el SLO.

## D-08 — Social, notificaciones y chat (aprobada, pendiente)

- **Decisión:** follows, likes idempotentes, comentarios, moderación básica y bloqueos. En el paso 6 el worker generará una bandeja propia; en 7b la UI la consultará mediante polling corto a través del gateway. Los envíos push serán simulados.
- **Alternativa descartada:** WebSocket, chat, FCM/APNs y preferencias avanzadas en esta versión.
- **Motivo:** notificaciones visibles en vivo con menor complejidad. El polling técnico de estado del paso 1 no es aún el polling de notificaciones.
- **Referencia:** RF-M4-01/02/03/04/09/11/12; ADR-M4-02/03.
- **Chat:** RF-M4-08 diferido; afecta tanto HU-M4-07 (Media) como HU-M4-10 (Alta, negociación marca–creador). ESC-M4-03 no se demostrará como recuperación de mensajería.
- **Nombres:** RF-M4 enumera `social.liked`, pero T-M4-06 menciona `social.reacted`. Para likes se priorizará el nombre de la interfaz funcional: `social.liked`. La discrepancia y los contratos concretos se detallarán en el paso 2; no se publicarán dos eventos por el mismo hecho.

## D-09 — Videos y stubs limitados (aprobada, pendiente)

- **Decisión:** MP4 locales generados con ffmpeg, patrones/colores con texto, 3–5 s, 480p y menos de 10 MB en total. Si ffmpeg no estuviera disponible, tarjetas con color/miniatura. El proceso `dependency-stubs` solo tendrá catálogo M2 y respuesta de anuncios M5 necesarios para la demostración.
- **Alternativa descartada:** descargas de videos ajenos y pipeline de publicación/transcodificación o monetización completos.
- **Motivo:** funcionamiento local reproducible y material propio liviano. Los MP4 se generarán al introducir el catálogo, no en el paso 1.
- **Referencia:** prototipos P-03/P-03b y RF-M3-09; exclusión de M2/M5 en AGENTS.md.

## Recortes aprobados y requisitos de prioridad Alta afectados

La prioridad está en las historias HU, no en cada RF. No hay HU Baja en los tres módulos copiados.

| Recorte | RF / HU afectado | Efecto en prioridad Alta |
|---|---|---|
| Panel de dispositivos | RF-M1-04 / HU-M1-04 Media | Sin panel, aunque las sesiones básicas y su rotación sí se prevén. |
| Google/Apple y verificación real de marca | RF-M1-02/06 / HU-M1-02/06 Alta | Federacion OIDC y validación SUNAT no implementadas. |
| Tipos de cuenta completos | RF-M1-05 / HU-M1-05 Alta | Se representarán roles/cuentas de prueba; transición completa no prevista. |
| 2FA | RF-M1-10 / HU-M1-09 Media | También se difiere 2FA obligatorio de roles privilegiados. |
| Equipos de marca | RF-M1-12 / HU-M1-11 Media | Sin invitaciones ni administración de equipos. |
| Derechos de datos y apelaciones | RF-M1-11/08 / HU-M1-10/07 Alta | Sin flujos legales completos ni atención de casos/SLA; suspensión básica no equivale a todo RF-M1-08. |
| Búsqueda avanzada | RF-M3-06 / HU-M3-06 Alta | Búsqueda parcial: sin sonidos, transcripciones ni motor distribuido completo. |
| Garantía de impresiones | RF-M3-08 / HU-M3-08 Alta | Fuente de exploración básica no equivale a garantizar 200–500 impresiones. |
| Escala y estructura de vistos | RF-M3-10/12 / HU-M3-10 Alta | Exclusión básica prevista; Bloom filter y precomputación del 10% más activo diferidos. |
| Tendencias avanzadas | RF-M3-07 / HU-M3-07 Media | Sin ventana de aceleración de 24 h. |
| Filtros de comentarios y colecciones | RF-M4-05/07 / HU-M4-12/06 Media | Diferidos. |
| Chat | RF-M4-08 / HU-M4-07 Media, HU-M4-10 Alta | Sin negociación marca–creador ni WebSocket. |
| Preferencias | RF-M4-10 / HU-M4-09 Media | Sin horarios de silencio ni selección por canal. |
| Compartir y push real | RF-M4-06/09 / HU-M4-05/08 Alta | Compartir diferido; notificaciones básicas previstas sin envío real al teléfono. |

RF-M3-05 se conserva para el paso 8 por instrucción del usuario; no queda recortado.
Las subfunciones no cubiertas se identificarán al desarrollar cada RF. No se equipara un stub o dato sembrado con implementación completa.

## Matriz histórica de cobertura de RF al cierre del paso 1

Esta tabla conserva el estado **del paso 1**, no el estado actual del prototipo. Los RF implementados en los pasos posteriores pueden figurar aquí como «Diferido». Para la cobertura vigente de la demo, consultar [DEMO.md](./DEMO.md#cobertura-final) y las decisiones D-17 a D-26 de este documento. Las capacidades parciales o diferidas no deben presentarse como cumplimiento completo.

**Completo:** implementado y verificado en todo su alcance aprobado, indicando diferencias con el documento original.
**Parcial:** se ejecuta una parte y se declaran las faltantes.
**Diferido:** aún no implementado; el plan no cuenta como cobertura.

| RF | Estado actual | Plan / límite previsto |
|---|---|---|
| RF-M1-01 | Diferido | Paso 3: OTP local; sin canal real. |
| RF-M1-02 | Diferido | Fuera del alcance: OIDC Google/Apple real. |
| RF-M1-03 | Diferido | Paso 3: JWT y rotación en memoria. |
| RF-M1-04 | Diferido | Fuera del alcance: panel de dispositivos. |
| RF-M1-05 | Diferido | Roles/cuentas de prueba; transición completa diferida. |
| RF-M1-06 | Diferido | Fuera del alcance: verificación real de marca. |
| RF-M1-07 | Diferido | Paso 3: roles y permisos; controles no usados se identificarán. |
| RF-M1-08 | Diferido | Suspensión/apelación completas diferidas. |
| RF-M1-09 | Diferido | Paso 3: perfil básico; privacidad completa por acotar. |
| RF-M1-10 | Diferido | Fuera del alcance: 2FA. |
| RF-M1-11 | Diferido | Fuera del alcance: derechos y flujos legales completos. |
| RF-M1-12 | Diferido | Fuera del alcance: equipos de marca. |
| RF-M1-13 | Diferido | Paso 3: auditoría en memoria; sin garantía duradera. |
| RF-M3-01 | Diferido | Paso 4: candidatos y ranking con catálogo reducido. |
| RF-M3-02 | Diferido | Paso 4: cursor y páginas; paso 7a: precarga. |
| RF-M3-03 | Diferido | Paso 4: intereses/región de demostración. |
| RF-M3-04 | Diferido | Paso 5: feed de cuentas seguidas. |
| RF-M3-05 | Diferido | Paso 8: No me interesa; otros filtros por acotar. |
| RF-M3-06 | Diferido | Paso 4 y 7b: búsqueda básica en memoria. |
| RF-M3-07 | Diferido | Fuera del alcance: tendencias avanzadas. |
| RF-M3-08 | Diferido | Exploración básica; cuotas de impresión garantizadas diferidas. |
| RF-M3-09 | Diferido | Paso 8: stub de anuncios y relleno orgánico. |
| RF-M3-10 | Diferido | Paso 4: vistos básicos; sin Bloom filter. |
| RF-M3-11 | Diferido | Paso 8: timeout, circuit breaker y respaldo. |
| RF-M3-12 | Diferido | Fuera del alcance: precomputación del 10% más activo. |
| RF-M3-13 | Diferido | Paso 8: versión activa, cambio y reversión de reglas. |
| RF-M4-01 | Diferido | Paso 5: seguimientos; privacidad/solicitudes por acotar. |
| RF-M4-02 | Diferido | Paso 5: likes y contadores; paso 7a: interfaz optimista. |
| RF-M4-03 | Diferido | Paso 5: comentarios/respuestas; paso 7b: UI. |
| RF-M4-04 | Diferido | Paso 5: moderación por creador; alcance exacto por registrar. |
| RF-M4-05 | Diferido | Fuera del alcance: filtros automáticos. |
| RF-M4-06 | Diferido | Fuera del alcance: compartir. |
| RF-M4-07 | Diferido | Fuera del alcance: colecciones. |
| RF-M4-08 | Diferido | Fuera del alcance: chat. |
| RF-M4-09 | Diferido | Paso 6 y 7b: bandeja y agrupación; push simulado. |
| RF-M4-10 | Diferido | Fuera del alcance: preferencias/horarios. |
| RF-M4-11 | Diferido | Paso 5: bloqueos; silenciamiento por acotar. |
| RF-M4-12 | Diferido | Paso 2: infraestructura; paso 5: eventos sociales reales; sin durabilidad tras reinicio. |

## Verificación del paso 1

Verificación ejecutada en Linux con **Node 20.20.2 y npm 10.9.9**:

- `npm ci --no-audit --no-fund`: instalación desde el lockfile correcta.
- `npm run build`: TypeScript y Next.js compilaron correctamente; la UI también tiene `strict: true` y `allowJs: false` explícitos.
- `npm test`: **9 pruebas aprobadas, 0 fallidas, 0 omitidas**. Incluyen límites de imports, nueve respuestas /health, agregación real del gateway, UI HTTP y ausencia de ruta de negocio, rechazo de doble arranque, parada/repetición y liberación de puertos, puerto ocupado y Ctrl+C durante arranque.
- `npm start`: los nueve procesos llegaron a estado saludable y se emitió `KIPU_READY`.
- `curl -s http://localhost:4000/health`: `{"service":"api-gateway","status":"ok"}`.
- `curl -s http://localhost:4001/health`: `{"service":"identity-service","status":"ok"}`.
- Navegador Chromium 147: la UI hidrató y mostró **9 / 9 disponibles**, con nueve indicadores disponibles y cero errores de JavaScript. Revisión visual en escritorio y móvil de 390 px; sin desbordamiento horizontal.
- `npm run stop`: confirmó salida de los procesos; arranque y parada terminaron con código 0. También se probó la señal SIGINT; la simulación de señal POSIX se omite si se ejecutan los tests en Windows. No se ejecutaron pruebas en Windows.
- Los 30 archivos de `referencia/` se compararon byte a byte con el ZIP original: sin diferencias. `AGENTS.md` continúa en su commit previo sin modificaciones.

Chromium se utilizó como herramienta externa de comprobación del entorno; no se agregó Playwright ni Chromium a las dependencias del repositorio. Los procesos quedaron detenidos al finalizar.

## D-15 — Fijación de PostCSS

El árbol ya resolvía `postcss` en `8.5.31`, mientras `next` declara `8.4.31` como dependencia transitiva. Se mantiene un `override` explícito en `package.json` para hacer determinista esa resolución. `npm audit` no reporta vulnerabilidades; por tanto, la decisión no responde a una alerta activa de audit. `package-lock.json` ya refleja `postcss@8.5.31`.

## D-16 â€” M2 4b: worker separado y moderaciÃ³n determinista

`media-service` conserva la Ãºnica copia del estado del video y es el Ãºnico publicador de `video.published` y `video.rejected`. `transcode-worker` no toca el almacenamiento privado; recibe los metadatos en `video.uploaded` y solo informa `video.transcoded` o `video.failed`. El timeout de moderaciÃ³n no publica porque un estado incierto debe fallar de forma segura: queda en `MODERATING` y playback sigue respondiendo `409`. `[revision]`, `[rechazo]`, `[timeout]` y `[fallo-transcode]` son marcas de demostraciÃ³n documentadas en el README.
## D-17 - Recorte del prototipo a una demostracion basica

Esta decision sustituye el plan anterior de pasos 5 a 9. El prototipo prioriza demostrar tacticas y fronteras de arquitectura; no pretende cubrir los requisitos de M3/M4 a fondo.

| Paso | Alcance aprobado |
|---|---|
| 5 | Feed: candidatos, ranking con 3-4 reglas desde JSON, pagina de 10 con cursor, busqueda por texto/hashtag y fallback `degraded:true`; consume `video.published`. |
| 6 | Social y notificaciones: seguir, like idempotente, comentarios simples, bloqueo y bandeja sencilla por eventos. |
| 7 | Una sola pagina UI con pestanas de login, subida, feed, busqueda, comentarios/likes y notificaciones. |
| 8 | Panel con interruptores para tumbar ranking, ralentizar ad-server y cambiar version de reglas; `DEMO.md` con guion de 5 minutos y matriz de cobertura. |

| Estado | Requisitos del recorte |
|---|---|
| Completo | Pasos 1-3, 4a y 4b; bus con reentrega/dead-letter/grupos; JWT y gateway; pipeline de video con playback firmado y moderacion segura. |
| Parcial | Feed/ranking/busqueda basicos; social y notificaciones basicos; UI de demostracion; panel y tacticas del paso 8. |
| Diferido | Bloom filter, tendencias, "no me interesa", agrupacion de notificaciones, push, chat, HLS/CDN, durabilidad, escala y SLO de produccion. |

Las pruebas se limitan a flujos principales y a tacticas demostrables: reentrega, falla segura, fallback, idempotencia y salud/arranque de los procesos.
## D-18 - Datos de demo y UI de publicacion simplificada

El prototipo es una demo local: nadie subira videos reales. `npm run seed` creara dos creadores y aproximadamente doce videos con titulos y hashtags variados, usando el MP4 interno y pasando cada video por el flujo real de M2 (`upload -> transcode-worker -> moderacion -> video.published`). Un video tendra `[revision]` y otro `[rechazo]` para hacer visibles ambos estados. El seed tambien se ejecutara al iniciar si el almacenamiento de demo esta vacio.

En el Paso 7 no habra selector de archivos. La UI tendra el boton "Publicar video de demo", un campo de titulo que acepta las marcas de prueba y una vista del cambio de estado en vivo. Los videos se mostraran como tarjetas con titulo, creador, hashtags y estado; el boton "ver URL firmada" solo mostrara la URL, sin reproductor. El resto de M2 no cambia.
## D-19 - Feed basico, ranking y anuncios degradables

`feed-service` mantiene una proyeccion minima de `video.published`; no lee el almacenamiento de `media-service`. `ranking-service` ordena candidatos con JSON versionado (`rk-2026.10.json` y `rk-2026.11.json`) y puede cambiar de version sin reinicio. Si falla dos veces o supera su timeout, el feed abre un circuito local y usa recientes/populares con `degraded:true`; vuelve a usar ranking despues de una ventana de recuperacion y una respuesta exitosa.

Los anuncios ocupan las posiciones 4, 12 y 20, con timeout de 80 ms. El ad-server falso permite cambiar la latencia en caliente; cada reemplazo por contenido organico incrementa `ad_fallbacks` en las metricas internas de `feed-service`. Las busquedas solo consultan la proyeccion de videos publicados. El feed no implementa "Siguiendo" ni recomendaciones avanzadas: el arranque en frio usa popularidad reciente y una lista simple de vistos por usuario.
## D-20 - Social y notificaciones basicos

`social-service` es dueño de sus mapas en memoria: follows, likes, comentarios y bloqueos. Cada accion funcional publica un evento con clave de idempotencia; repetir un like no publica un segundo efecto. `feed-service` y `notification-worker` solo mantienen proyecciones propias derivadas de eventos. `notification-worker` deduplica por `idempotency_key` y conserva una bandeja independiente sin agrupacion ni push.

El feed "Siguiendo" se construye con `social.followed`, sin leer el almacen social. El bloqueo se aplica en el servicio social: impide seguir o comentar al bloqueador y oculta al bloqueador los comentarios del bloqueado. Los comentarios son de un nivel, con respuestas opcionales.

La cobertura de RF-M3-02 es **parcial**: el feed usa un cursor numerico simple (`0`, `10`, `20`) para la demo, no un cursor opaco firmado o resistente a cambios de la coleccion.

La cobertura de RF-M4-03 es **parcial**: los comentarios permiten un comentario raiz y respuestas de un solo nivel; no se implementan hilos arbitrariamente anidados.

## D-21 - Proyecciones sociales y dueño de video en servidor

`social-service` consume `video.published` y mantiene una proyeccion minima de `video_id -> owner_id`. Likes y comentarios resuelven el destinatario desde esa proyeccion; `owner_id` del cuerpo se ignora y ya no forma parte del contrato. Esto evita que un cliente falsifique al destinatario de una notificacion.

`DELETE /v1/social/follow/:id` publica `social.unfollowed`; `feed-service` consume ese evento y elimina la cuenta de su proyeccion de "Siguiendo". `social.liked` incrementa el engagement local que se envia al ranking, de modo que los likes pueden cambiar el orden sin leer el almacen social.

## D-22 - UI de demo y seed interno

`apps/kipu-web` es una sola pagina Next.js en espanol, con CSS simple y un cliente HTTP que solo conoce el API Gateway. El gateway ofrece una fachada `/v1/auth/demo/seed` para que el navegador no llame servicios internos directamente. El endpoint `/v1/auth/internal/demo/seed` sigue siendo exclusivamente de demo, no es un contrato de produccion ni una ruta que deba existir en produccion; se mantiene para las pruebas y scripts locales.

## D-23 - Puerta de demo y panel de cierre

Las rutas `/v1/auth/demo/*` y `/v1/demo/*` del gateway solo existen funcionalmente cuando `DEMO_MODE=true`; sin esa variable devuelven 404. `npm start` establece `DEMO_MODE=true` por defecto para la demo local, pero un entorno de produccion no debe habilitarla. Las palancas del panel nunca llaman puertos internos desde el navegador: pasan por el gateway y este las reenvia a ranking, ad-server, health, feed y bus.

El panel es deliberadamente de lectura y control local: muestra health, modo degradado, ruleset, fallbacks, eventos recientes y dead-letters. No convierte las simulaciones de M3/M5 en capacidades de produccion ni añade persistencia, autenticacion administrativa o SLO.

## D-24 - API Management minimo en el gateway

La primera version del gateway añadio una cuota local para rutas autenticadas: JWT, cabeceras `X-RateLimit-Limit`, `X-RateLimit-Remaining` y `X-RateLimit-Reset`, respuesta `429` con `Retry-After` y cabeceras visibles mediante CORS. Un usuario no consume la cuota de otro y se descartan ventanas expiradas. `GET /v1/demo/api-management` expone la politica y sus contadores solo con `DEMO_MODE=true`. La decision D-26 amplia esta base con politicas separadas para rutas publicas, feed y uploads. Sigue sin ser un API management distribuido con cuotas persistentes, planes comerciales o almacenamiento compartido.

## D-25 - Videos demo embebibles

Los videos semilla usan IDs directos de YouTube con `youtube.com/embed/...` y se reproducen dentro de la tarjeta mediante `iframe`; las subidas MP4 siguen usando el almacenamiento local y playback firmado. La disponibilidad del embed depende de que YouTube permita la insercion del video concreto.

## D-26 - Tres politicas y metricas HTTP medidas

El gateway separa politicas: registro/OTP (10 peticiones por IP cada 60 s), feed (60 por usuario cada 10 s) y uploads (20 por usuario cada 60 s, contando inicio y confirmacion); otras rutas JWT conservan 60 por usuario cada 10 s. Los limites se aplican antes de reenviar a cada servicio. La pestaña API Management usa rutas de prueba `DEMO_MODE` sometidas a esas mismas cuotas sin crear usuarios ni archivos. La tabla se alimenta de cada respuesta HTTP observada en el gateway: solicitudes, rechazos `429` y latencia media desde el arranque. Las peticiones de prueba aparecen como `DEMO`, separadas de las rutas reales. La politica de IP y las metricas en memoria son simplificaciones locales, no defensa distribuida ni auditoria durable.
