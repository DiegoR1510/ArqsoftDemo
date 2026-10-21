# Propuesta del nuevo paso M2 — pendiente de aprobación

Se ejecutará después de terminar y aprobar los pasos 2 (bus) y 3 (M1 y gateway), antes de implementar M3. Existe un commit del paso 2, pero eso no acredita aprobación del usuario. Este documento no autoriza implementación ni cambia la numeración de los pasos restantes.

## Objetivo y fuentes

Demostrar un ciclo local de contenido con estado propio, procesamiento asíncrono, moderación previa y eventos para el feed. Fuentes: [RF y HU](referencia/2/2.1/2.1.2/2.1.2.md), [escenarios](referencia/2/2.2/2.2.2/2.2.2.md), [ADR](referencia/4/4.2/4.2.md) y [tácticas](referencia/5/5.2/5.2.md).

## Implementación propuesta

- Crear `apps/media-service` para metadatos, autorización, máquina de estados y repositorios propios; reservar el puerto 4002 tras comprobar disponibilidad. Crear `apps/transcode-worker` como proceso separado, conectado mediante contratos y transporte local, sin importar código del servicio.
- Usar interfaces para almacenamiento, trabajos y moderación. Metadatos y cola en memoria; archivos de demostración en almacenamiento local privado. La pérdida de estado al reiniciar seguirá siendo una limitación explícita.
- Mantener las rutas documentadas: `POST /v1/uploads`, `POST /v1/uploads/{id}/complete`, `GET/PATCH/DELETE /v1/videos/{id}`, `GET /v1/videos/{id}/playback`, `POST /v1/videos/batch` y `POST /v1/reports`. Implementarlas por incrementos; no presentar las rutas pendientes como disponibles.
- Para el primer incremento, proponer ingesta local limitada a MP4 de prueba y reproducción MP4 autorizada. No equivale a subida multipart directa a S3 ni HLS adaptativo. Cualquier ruta técnica adicional de transferencia o consulta de subida se documentará antes de implementarla.
- Conservar `UPLOADING → UPLOADED → TRANSCODING → MODERATING → PUBLISHED | SCHEDULED | REJECTED | FAILED` como contrato de referencia. La programación queda diferida; no se permitirá entrar en `SCHEDULED` hasta implementarla. RF-M2-13 tiene precedencia sobre el resumen abreviado de ADR-M2-02.
- Proponer un adaptador de procesamiento simulado inicialmente, identificado como tal. FFmpeg y representaciones HLS requieren un incremento posterior aprobado; pasar por `TRANSCODING` no demostrará conversión real.
- Moderación determinista de demostración: aprobado publica; revisión o caída permanecen en `MODERATING`; rechazo termina en `REJECTED`. Nunca publicar ante un timeout. No se simulará que existe clasificación automática real.
- Publicar los eventos documentados según las operaciones implementadas: `video.uploaded`, `video.transcoded`, `video.published`, `video.rejected`, `video.deleted`, `video.reported`, con `event_id`, `idempotency_key` y `trace_id`. Un resultado simulado se identificará en su contrato. Confirmar entregas después de aplicar el efecto y deduplicar reintentos.
- M3 mantendrá su proyección por eventos y usará la hidratación por API; no leerá el repositorio de M2. M5 seguirá en stubs. El acceso a videos privados dependiente de relaciones M4 quedará denegado hasta integrar y comprobar esos permisos.

## Incrementos para aprobación individual

1. Servicio y worker, metadatos básicos, ingesta de prueba, estados, moderación simulada y eventos; pruebas HTTP a través del gateway con identidad del paso 3.
2. Reproducción local autorizada, edición y eliminación lógica; comprobación de propietario, tokens vencidos y sesiones ajenas. La firma propuesta durará cinco minutos y se comprobará al servir el archivo.
3. Reportes, integración con M3/M4 y UI en los pasos correspondientes. Evaluar aparte multipart, FFmpeg y HLS antes de ampliar el alcance.

## Archivos previstos

Nuevos archivos en `apps/media-service/` y `apps/transcode-worker/`; contratos en [packages/contracts](packages/contracts/), uso del cliente de [packages/events](packages/events/) y autenticación de [packages/auth](packages/auth/). Ajustes en [gateway](apps/api-gateway/), [scripts](scripts/), [tests](tests/), [package.json](package.json), lockfile, [README](README.md) y [DECISIONES](DECISIONES.md). Los nombres internos definitivos se detallarán antes de codificar cada incremento.

## Cobertura

Actualmente **todos los RF-M2-01 a RF-M2-13 están diferidos**: esta propuesta no implementa ninguno.

| RF | Cobertura prevista si se aprueba la propuesta |
|---|---|
| 01–02 | 01 parcial: ingesta local limitada; 02 diferido: multipart, checksum por fragmento y reanudación 24 h. |
| 03–04 | Diferidos: cuatro representaciones HLS y miniaturas reales; procesamiento simulado no acredita estos RF. |
| 05 | Parcial: falla segura verificable; clasificación real, cola humana completa y apelaciones diferidas. |
| 06 | Parcial: límites de título, descripción y hashtags; menciones contra M1 e integración de campañas se acotarán explícitamente. |
| 07–08 | Diferidos: programación y audio licenciado. |
| 09 | Parcial: reproducción local protegida; HLS, CDN y precarga diferidos. |
| 10 | Diferido: subtítulos. |
| 11 | Parcial: edición auditada y eliminación lógica; borrado físico a 30 días y retenciones diferidos. |
| 12 | Diferido al tercer incremento: reportes independientes y umbral de revisión. |
| 13 | Parcial: estados y consulta; programación y notificación terminal dependen de incrementos posteriores/M4. |

No se afirmará cumplimiento de SLO de producción, escalado, redundancia multizona, durabilidad o costos de ESC-M2-01 a 07. La falla segura de T-M2-04 y la idempotencia de T-M2-03 sí tendrán verificaciones locales, sin equipararlas al escenario completo.

## Validación requerida al implementar

Ejecutar build y tests. Verificar aislamiento de aplicaciones, autorización y propiedad, transición inválida, reentrega sin duplicación, caída de moderación sin publicación, rechazo, acceso con firma vencida/ajena y eliminación. Al implementar M3, verificar que solo aparezcan publicados y que la eliminación retire el video. Documentar comandos reproducibles y resultados reales en cada paso antes de solicitar aprobación del siguiente.
