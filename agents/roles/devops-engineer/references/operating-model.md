# Modelo operativo de DevOps Engineering

## Contrato de cambio

```markdown
Objetivo y estado deseado:
Entornos y recursos:
Artefacto, versión y procedencia:
Identidades y secretos:
Dependencias y estado remoto:
Plan y blast radius:
Validaciones y gates:
Estrategia de despliegue:
Health checks y observabilidad:
Rollback o forward-fix:
Datos, backups y restauración:
Costo y capacidad:
Autorización requerida:
```

## Pipeline de entrega

1. Construir una vez desde una revisión identificable.
2. Generar artefacto inmutable, metadatos y verificaciones.
3. Probar en niveles proporcionales al riesgo.
4. Promover el mismo artefacto con configuración externa validada.
5. Aplicar gates de entorno y mínimo privilegio.
6. Verificar salud técnica y señal de negocio.
7. Detener, revertir o avanzar con una reparación previamente definida.

Evitar pasos manuales no registrados. Una aprobación no reemplaza validaciones técnicas y una automatización no reemplaza autoridad humana cuando la política la exige.

## Infraestructura como código

- Revisar formato, validación, políticas y plan antes de aplicar.
- Leer el plan completo y resolver valores desconocidos o reemplazos inesperados.
- Proteger estado, locking y cifrado; limitar quién puede leerlo porque puede contener datos sensibles.
- Diseñar módulos pequeños con entradas, salidas, versiones y ownership claros.
- Importar o corregir drift sólo después de decidir cuál es la fuente de verdad.
- Aplicar cambios compatibles por etapas cuando recursos, datos o tráfico lo requieran.

## Secretos y cadena de suministro

- Preferir federación y credenciales efímeras sobre secretos de larga duración.
- Fijar acciones e imágenes a versiones confiables; revisar actualizaciones antes de adoptarlas.
- Generar procedencia y SBOM cuando el riesgo y ecosistema lo permitan.
- Separar permisos de lectura, build, deploy y administración.
- Evitar ejecutar código no confiable con secretos o tokens privilegiados.

## Despliegue y recuperación

Elegir rolling, blue/green, canary o recreación según compatibilidad, costo y recuperación. Definir señales, umbrales y ventana antes de comenzar. Probar rollback cuando sea seguro; para migraciones no reversibles, preferir compatibilidad progresiva y forward-fix. Probar restauración, RTO y RPO en lugar de asumirlos por la existencia de backups.

## Control de calidad

- ¿El plan coincide con el alcance y evita reemplazos inesperados?
- ¿Build y promoción usan el mismo artefacto verificable?
- ¿Identidades y secretos tienen mínimo privilegio y exposición mínima?
- ¿Los reintentos y concurrencia son seguros?
- ¿Health checks y señales detectan fallo real sin filtrar secretos?
- ¿Rollback, forward-fix y restauración son practicables?
- ¿Drift, costo, capacidad y ownership son visibles?
- ¿Las escrituras remotas tienen autorización explícita?

## Fundamento externo

Modelo sintetizado con fuentes revisadas en agosto de 2026:

- [DORA — Capabilities](https://dora.dev/capabilities/): prácticas de entrega, feedback, arquitectura y cultura asociadas con desempeño sostenible.
- [SLSA Specification](https://slsa.dev/spec/): niveles y controles de procedencia e integridad de la cadena de suministro.
- [OpenTofu Documentation](https://opentofu.org/docs/): flujo declarativo, planes, estado, locking y módulos de infraestructura como código.
- [GitHub Actions security hardening](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions): permisos, código de terceros, OIDC y protección de workflows.

Verificar siempre documentación oficial del proveedor, herramienta y versiones reales de cada empresa.
