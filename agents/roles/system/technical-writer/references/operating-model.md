# Modelo operativo de Technical Writing

## Brief documental

```markdown
Audiencia y conocimiento previo:
Necesidad: aprender / completar / consultar / comprender
Outcome del lector:
Producto, versión y entorno:
Alcance / no alcance:
Fuentes canónicas y SMEs:
Sensibilidad y permisos:
Formato, canal e idioma:
Criterios de exactitud y usabilidad:
Owner, revisión y obsolescencia:
```

## Tipos de contenido

- **Tutorial:** experiencia guiada y segura para aprender; priorizar éxito inicial.
- **How-to:** pasos enfocados en una meta real; declarar variantes y prerrequisitos.
- **Referencia:** descripción exacta, completa y estructurada de una interfaz.
- **Explicación:** contexto, razones, relaciones y trade-offs para comprender.

No forzar cuatro secciones vacías; crear sólo el contenido que la audiencia necesita y enlazar entre tipos.

## API y código

Usar la especificación y tests compatibles con la implementación. Documentar versión/base URL, autenticación sin credenciales reales, operación, parámetros, schemas, ejemplos, códigos/errores, paginación, rate limits, idempotencia, webhooks y deprecación. Ejecutar ejemplos en un entorno seguro o declarar explícitamente que no fueron ejecutados.

## Runbook

```markdown
Síntoma, impacto y alcance:
Permisos y guardias:
Diagnóstico con señales esperadas:
Mitigación reversible:
Verificación:
Rollback:
Escalación y comunicaciones:
Evidencia a conservar:
Última prueba, entorno y owner:
```

## Mantenimiento

Asignar owner, versión soportada y fecha de última verificación. Vincular cambios de interfaz con revisión documental. Observar búsquedas fallidas, abandono, feedback y tickets sin confundir correlación con causa. Archivar o redirigir contenido obsoleto conservando historial útil.

## Control de calidad

- ¿Audiencia, tarea, versión y entorno están explícitos?
- ¿Cada claim técnico apunta a fuente o prueba?
- ¿Ejemplos y resultados fueron ejecutados o marcados no verificados?
- ¿Prerrequisitos, errores, límites y rollback son claros?
- ¿Navegación, terminología y enlaces son consistentes?
- ¿Contenido sensible fue excluido o sanitizado?
- ¿La estructura funciona con teclado, lector y sin depender de color/posición?
- ¿Owner y señal de obsolescencia permiten mantenimiento?

## Fundamento externo

- [Google developer documentation style guide](https://developers.google.com/style): claridad, consistencia, audiencia global y jerarquía de estilo.
- [Diátaxis](https://www.diataxis.fr/start-here/): separación de tutoriales, how-to guides, referencia y explicación según necesidad del lector.
- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/): criterios verificables de accesibilidad para contenido web.
- [OpenAPI Specification](https://spec.openapis.org/oas/latest.html): contrato estándar para describir APIs HTTP; verificar compatibilidad de herramientas antes de adoptar una versión.

Adaptar estas referencias a la guía, audiencia, tecnología y publicación reales de cada empresa.
