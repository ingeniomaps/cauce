---
caso: 492
titulo: Las lecciones salen sólo del Review de autobuild; lo que una persona corrige en la review del PR no entra
estado: abierto
prioridad: baja
version-detectada: 0.119.0
---

# 492 — Las lecciones salen sólo del Review de autobuild; lo que una persona corrige en la review del PR no entra

**🔴 abierto** · detectado en 0.119.0 · prioridad **baja**: es una fuente nueva, no un defecto. Pide una decisión de producto y una integración con la forja, y depende del 484.

## Resumen

`ops lessons` cuenta las reglas que el Review de `autobuild` mandó a corregir, leyendo `done/`. Lo que una persona corrige después, en la review del PR, es la señal más fiel de lo que el equipo exige, y no entra en ningún lado. Lo valioso de la fuente ajena es un filtro: sólo cuenta lo que el equipo aceptó, es decir el código corregido en ese sentido o una respuesta con argumento que cerró el hilo. Las opiniones de un revisor que nadie aceptó no cuentan.

## Reproducción

No es un defecto, así que no hay nada que reproducir. Lo comprobado:

- `template/planning/LESSONS.md:3-6`: las lecciones salen de lo que el Review de `autobuild` dejó en `done/`.
- `engine/planning/lessons.js:34-37`: `corrected()` lee sólo el segmento `corregido:` de `done/`.

## Causa raíz

No hay lectura de la forja en el motor de lecciones. Es una decisión de alcance, no un error.

## Fix propuesto

**Antes de construir hay que decidir** si Cauce lee la forja para esto. La propuesta, si se decide que sí:

- `ops lessons --from-prs <rango>` lee con `gh` (sin dependencias nuevas) los hilos de review de los PR mergeados.
- Toma sólo los hilos cerrados con un commit posterior que toca las líneas comentadas, o con una respuesta del autor.
- Los propone como lecciones sin promover, igual que hoy.

## Tradeoffs

- **Depende de `gh` y de una forja**: GitHub hoy. Una instancia con otra forja no lo tendría, y eso hay que declararlo.
- **Clasificar si un hilo se aceptó es interpretación.** El script decide sólo por señales comprobables (commit sobre las líneas, hilo resuelto). Lo demás lo lee un agente, como pide la convención de guards sin listas de palabras.
- **Depende del 484:** mientras `corregido:` no signifique corregido, sumar otra fuente al mismo contador mezcla dos señales de calidad distinta.

## Contexto de descubrimiento

Sale de la revisión del 2026-11-05 de los repositorios de una organización externa. Tienen una skill que saca lecciones de los hilos de review de los PR mergeados: según ellos, 263 hilos, 44 de revisores de IA. Propone reforzar una regla o crear una nueva, siempre con confirmación humana. Esos números no se reprodujeron.

## Relacionados

- Caso 484: lo que `done/` dice que se corrigió.
