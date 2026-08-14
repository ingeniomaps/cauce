# Modelo operativo de Developer Relations

## Contrato de experiencia

```markdown
Audiencia, contexto, idioma y accesibilidad:
Job-to-be-done y primer valor:
Journey y fricción basada en evidencia:
Outcome, baseline, métrica y guardrails:
Artefacto, canal y lifecycle:
Versión, entorno y prerequisitos:
Owners, revisión y autoridad de publicación:
Soporte, feedback y mantenimiento:
```

## Checklist de ejemplo ejecutable

Partir de entorno limpio; fijar runtime, dependencias y API/SDK; declarar cuentas, permisos, tiempo y costo; usar variables de entorno, secretos ficticios y datos sintéticos; incluir happy path, error común, límites, cleanup y siguiente paso. Ejecutar comandos y pruebas reales. Registrar fecha/commit/versión. Marcar claramente pseudocódigo, mocks y resultados simulados.

## Workshop, demo o talk

Definir audiencia, objetivos observables, agenda, prerequisitos, entorno, capacidad, accesibilidad, datos, licencias, grabación/consentimiento, código de conducta, soporte, contingencia y follow-up. Ensayar desde cero y preparar fallback honesto. No revelar roadmap, vulnerabilidades, clientes o material embargado.

## Feedback brief

Registrar problema, segmento/contexto, evidencia y fuente consentida, frecuencia, severidad, impacto, pasos reproducibles, versión, workaround, alternativas, hipótesis e incógnitas. Eliminar datos personales innecesarios. Product/Engineering priorizan; DevRel no promete fecha.

## Métricas

Separar reach → engagement → activation → first value → retained use → production readiness → contribution. Definir evento, grain, identidad, ventana, cohortes, exclusiones y baseline. Combinar telemetría permitida con research cualitativo. Vigilar spam, vanity, costo, seguridad, privacidad, burnout y gaming.

## Comunidad y contribuciones

Publicar expectativas, código de conducta, soporte y rutas de escalación. Hacer triage consistente; proteger reporters y evidencia; no investigar o sancionar sin autoridad. Para contribuciones, verificar licencia/provenance, tests, seguridad, compatibilidad, ownership y mantenimiento antes de merge.

## Fundamento externo

- [OpenAPI Specification 3.2.0](https://spec.openapis.org/oas/latest.html): descripción versionada y agnóstica al lenguaje de APIs HTTP; confirmar la versión soportada por producto y tooling.
- [NIST SP 800-218 SSDF 1.1](https://csrc.nist.gov/pubs/sp/800/218/final): prácticas de desarrollo seguro aplicables a samples, SDKs y contribuciones.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/): criterios testables para accesibilidad web; desde 2025 también fue aprobada como ISO/IEC 40500:2025.
- [Open Source Guides — Building Welcoming Communities](https://opensource.guide/building-community/): prácticas para comunidades abiertas; adaptar a políticas, plataforma y autoridad reales.

Las fuentes orientan el método. La documentación pública aprobada del producto es la autoridad sobre sus capacidades.
