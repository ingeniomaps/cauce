# Modelo operativo de Backend Engineering

## Contrato de servicio

```markdown
Operación y propósito:
Actor y autorización:
Entrada, límites y validación:
Invariantes:
Lecturas y escrituras:
Transacción y concurrencia:
Respuesta y errores:
Idempotencia y retries:
Efectos externos y compensación:
Privacidad y auditoría:
Observabilidad:
Compatibilidad y migración:
Pruebas:
```

Usar semántica HTTP coherente cuando el transporte sea HTTP. No convertir GET en una operación con efectos ni reintentar operaciones no idempotentes sin mecanismo explícito.

## Datos y migraciones

- Preservar invariantes en la base y el dominio cuando sea viable.
- Hacer cambios compatibles por etapas: expandir, migrar/verificar y contraer.
- Separar despliegue de código, migración y backfill cuando reduzca riesgo.
- Diseñar rollback o forward-fix antes de ejecutar.
- Probar con volumen y forma de datos representativos, sin copiar producción sensible.
- Evitar locks extensos y asumir concurrencia desde el diseño.

## Integraciones

Tratar terceros como no confiables y falibles. Validar respuestas, autenticar callbacks, deduplicar eventos, fijar timeouts y límites, registrar correlación sin secretos y distinguir errores recuperables de permanentes. No hacer retry ciego de efectos no idempotentes.

## Seguridad

- Denegar por defecto y comprobar autorización por objeto y propiedad.
- Evitar mass assignment y exposición excesiva.
- Parametrizar consultas y escapar sólo según el contexto.
- Limitar consumo de recursos y flujos sensibles.
- No confiar en URLs o callbacks proporcionados sin controles contra SSRF.
- Rotar y almacenar secretos mediante mecanismos de la plataforma, nunca en código.

## Observabilidad

Emitir logs estructurados, métricas y trazas proporcionales al riesgo. Incluir identificadores de correlación seguros, resultado, latencia y causa clasificable. Excluir credenciales y datos personales. Una alerta debe corresponder a una acción humana o automática definida.

## Control de calidad

- ¿Se preservan invariantes bajo concurrencia y retries?
- ¿Cada operación y objeto exige autorización correcta?
- ¿Entradas y salidas respetan contrato y límites?
- ¿Fallos externos dejan estado conocido y recuperable?
- ¿Migración y compatibilidad tienen estrategia verificable?
- ¿La telemetría permite explicar un fallo sin exponer datos?
- ¿Las pruebas cubren éxito, rechazo, duplicado y fallo parcial?
- ¿Los comandos de verificación terminaron realmente?

## Fundamento externo

Modelo sintetizado con fuentes revisadas en agosto de 2026:

- [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html): semántica HTTP, métodos, códigos, seguridad e idempotencia.
- [OpenAPI Specification](https://spec.openapis.org/oas/latest.html): contratos HTTP legibles por humanos y herramientas.
- [OWASP API Security Top 10](https://owasp.org/API-Security/editions/2023/en/0x11-t10/): autorización por objeto/propiedad, consumo de recursos, SSRF y consumo inseguro de APIs.
- [OpenTelemetry Signals](https://opentelemetry.io/docs/concepts/signals/): trazas, métricas y logs como señales complementarias.

Verificar siempre documentación oficial y versiones reales del stack de cada empresa.
