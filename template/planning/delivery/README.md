# Delivery — camino ideal de entrega

Esta guía describe un estado objetivo adaptable, no capacidades que el proyecto ya posea. Cada proyecto
declara en `project.md` qué partes existen, cuáles aplican y qué deuda separa la realidad del objetivo.

## Mapa

| Archivo | Fuente de verdad de | Aplicación |
|---|---|---|
| `branches.md` | Ramas, PR, integración y gates. | Elegir política y excepciones. |
| `release.md` | Artefactos, versiones, promoción y rollback. | Proyectos liberables. |
| `environments.md` | Pregunta, datos y ciclo de vida de cada ambiente. | Sistemas desplegables. |
| `flags.md` | Release toggles temporales. | Productos con activación gradual. |
| `multi-repo.md` | Versionado y compatibilidad entre repos. | Solo workspaces multi-repo. |
| `project.md` | Estado real, decisiones adoptadas y evolución. | Obligatorio personalizar. |

Un proyecto puede adoptar una parte sin fingir que adoptó las demás. Una desviación durable se documenta en
una ADR propia; una capacidad pendiente se registra en roadmap o INBOX.

## Principios recomendados

1. `main` es el único tronco de larga vida; otras ramas son breves y revisables.
2. Se promueve un artefacto inmutable, no una rama ni una reconstrucción por ambiente.
3. El mismo artefacto probado avanza entre ambientes con configuración externa.
4. Cada ambiente responde una pregunta distinta; un ambiente no es una rama.
5. Rollback restaura una versión conocida sin exigir un build nuevo.
6. Los ambientes difieren en escala y datos, no innecesariamente en arquitectura.
7. Cada componente versiona de forma independiente y demuestra compatibilidad mediante contratos.

“Artefacto” puede ser una imagen, paquete, binario, sitio estático, manifiesto o bundle. La guía no obliga a
usar contenedores, múltiples ambientes, feature flags ni varios repositorios cuando el producto no los necesita.

## Recorrido de referencia

```text
rama breve -> PR + CI -> main -> artefacto -> staging -> aprobación -> production
rama breve -> preview opcional              production -> rollback por versión
```

Antes de implementar este recorrido, completar `project.md` con evidencia del estado actual y el siguiente
incremento que realmente aporta valor.
