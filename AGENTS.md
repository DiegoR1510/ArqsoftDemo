# KIPU – Prototipo funcional (Arquitectura de Software)

## Contexto
KIPU es una red social de video corto con marketplace de marcas y creadores (Perú/LATAM).
Este repo es un prototipo de 4 módulos: M1 Identidad, M2 Contenido, M3 Feed y Búsqueda, M4 Social y Notificaciones. M5 (monetización) se simula con stubs.

## Fuente de verdad
`referencia/` contiene la documentación del proyecto (SOLO LECTURA, no modificar).
Los nombres de endpoints, eventos, roles y tácticas deben coincidir con esos documentos.
Si algo es ambiguo, elige lo más simple y regístralo en `DECISIONES.md`.

## Principios de arquitectura (los que se quieren demostrar)
- Servicios separados por módulo; cada uno con su propio almacén, sin compartir datos.
- Comunicación entre módulos por eventos (con event_id, idempotency_key, trace_id, entrega al menos una vez).
- Un API Gateway como único punto de entrada (JWT, rate limit, trace_id).
- Degradación controlada: si ranking o ad-server fallan, el feed sigue funcionando.
- Sin Docker ni infraestructura externa: Postgres/Redis/Kafka/OpenSearch se reemplazan por adaptadores en memoria detrás de interfaces.
- Una aplicación nunca importa código de otra aplicación; solo de `packages/`.

## Stack
TypeScript estricto, Node 20, NestJS para servicios, Next.js para la UI, npm workspaces.

## Forma de trabajo
- Trabaja por pasos pequeños y NO avances al siguiente sin que yo lo apruebe.
- Antes de codificar un paso, explica en pocas líneas qué vas a hacer y qué archivos tocarás; espera mi "adelante".
- Después de cada paso: ejecuta build y tests, y dime exactamente cómo probarlo yo mismo.
- No declares algo terminado si no lo ejecutaste.
- Explícame las decisiones de arquitectura en lenguaje simple: es un trabajo académico y debo poder defenderlas.
- Haz un commit por paso, con mensaje claro, y actualiza `DECISIONES.md` (decisión, alternativa descartada, motivo, táctica o ADR relacionado).
- Marca cada requisito como completo, parcial o diferido; no presentes una simplificación como cumplimiento total.
