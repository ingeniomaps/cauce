---
caso: 216
titulo: el INBOX choca entre líneas de trabajo en paralelo
estado: resuelto
resuelto-en: 0.100.0
prioridad: media
version-detectada: 0.99.2
---

# 216 — `INBOX.md` es un archivo por instancia, y dos líneas que anotan en la misma sección chocan

**🟢 resuelto en 0.100.0** · detectado en 0.99.2 · prioridad **media**.

**Prioridad media**: no pierde nada —git frena—, pero los recorridos anotan en el INBOX en cada corrida (Review,
Build, el cierre con las lecciones), así que dos líneas en paralelo chocan seguido; en `acme-ops` pasó 1 de 4
veces. Sale del caso 212, que resolvió la cola y dejó éste aparte porque el INBOX tiene otra vida: entradas
sueltas, sin orden.

## Resumen

Las entradas nuevas van al final de su sección. Dos líneas que anotan en la misma sección escriben la misma zona
del mismo archivo, y al traer una a la otra choca.

## Reproducción

Con git 2.43.0, en un repo descartable: `planning/INBOX.md` con `## Propuestas` y `## Lecciones` vacías; la rama
`work/a` agrega `- **cache-de-precios** — …` bajo Propuestas, la rama `work/b` agrega `- **reintentos-pagos** — …`
en el mismo lugar; `main` trae `work/a` y `work/b` trae `main`.

## Síntoma

```
CONFLICTO (contenido): Conflicto de fusión en planning/INBOX.md
Fusión automática falló; arregle los conflictos y luego realice un commit con el resultado.
```

## Causa raíz

`engine/planning/parser.js`, `inboxSections`: un solo `INBOX.md`. Y `automatization/shared/inbox.js`: los
recorridos piden agregar ahí.

## Fix propuesto

El mismo patrón del 212: un archivo por entrada (`inbox/<sección>/<slug>.md`) o por sección y línea, con
`INBOX.md` leído primero como hasta hoy. Antes de construirlo hay que decidir la forma, porque cambia lo que
una persona lee para promover: una sección hoy se lee de un vistazo en un archivo.

## Tradeoffs

- Leer el INBOX deja de ser abrir un archivo; `tree` ya lo resume, pero promover pide verlo entero.

## Contexto de descubrimiento

Partido del caso 212 al mejorarlo, el 2026-10-01.

## Relacionados

- 212 — la cola partida por hito.

## Cierre

Resuelto en 0.100.0 con un archivo por entrada, la forma que eligió Manuel el 2026-10-01 entre las dos que el
fix proponía.

- **Antes de construir, decidir la forma** — se hizo: se preguntó y salió «un archivo por entrada» frente a
  «uno por sección y línea». La segunda volvía a chocar el día que dos sesiones compartieran línea.
- **Un archivo por entrada, `inbox/<sección>/<slug>.md`, con `INBOX.md` leído primero** — se hizo.
  `inboxSections` (`engine/planning/parser.js`) suma a cada sección lo que hay en su carpeta, después de
  `INBOX.md`; un archivo sin nombre en negrita cuenta como salteado, igual que una viñeta. Los seis
  escritores apuntan a la carpeta con la misma instrucción (`INBOX_FILES` en `automatization/shared/inbox.js`):
  en `autobuild`, `review-noted` y `lessons-noted`; en `flow`, `report-inbox`, `inbox-lesson` y la idea de
  investigar; en `onboard`, las preguntas abiertas.
- **Causa raíz en `automatization/shared/inbox.js`** — se hizo ahí: el fragmento lleva ahora dónde va y cómo
  se nombra cada entrada. Los prompts no dicen más «la sección X de `INBOX.md`».
- **Tradeoff: leer el INBOX deja de ser abrir un archivo** — se decidió aceptarlo. `tree` cuenta los dos
  lados juntos, y `planning/inbox/README.md` explica que promover o descartar es borrar el archivo. Ese
  README llega también a las instancias que actualizan (`upgrade` en `TEMPLATE_OWN`). Para leerlo
  entero se agregó `ops inbox <planning>` —lo decidió Manuel después del PR #635, todavía en 0.100.0—:
  imprime cada sección con sus entradas enteras y el archivo de cada una, que es lo que hay que borrar al
  promover, y lo mismo en `--json`. Sale del mismo lector que `tree` y `check`, así que no puede contar
  distinto. `product-manager`, que cura el INBOX, lo lee con ese comando.

Lo que el caso no preveía:

- **El molde y los contratos mandaban a `INBOX.md` en catorce lugares fuera de los recorridos.** Están en tres
  `SKILL.md` (`growth-marketer`, `product-manager`, `finops-engineer`), en dos `FLOW.md`, en
  `shared/onboard.md`, en la skill `flow`, en el `CLAUDE.md` del runner, en `template/AGENTS.md` y en el molde
  de flow, `LESSONS.md` y `teamwork.md`. Todos pasaron a la carpeta. Los que nombran el INBOX como concepto
  —«promover desde el INBOX»— quedaron como estaban, porque siguen siendo ciertos. Los tres cargos no se
  volvieron a evaluar: el cambio es dónde escriben, no qué deciden, y ninguno de sus casos mide la ruta.
- **Una carpeta mal nombrada o un archivo con otro nombre desaparecían sin aviso.** `inbox/mejoras/` no se
  lee, y un archivo que no se llama como su entrada se cuenta pero no se encuentra al promover. `check` avisa
  los dos (`engine/planning/inbox.js`), sin fallar, por la misma razón que los avisos del caso 101.
- **El aviso de «se llama como una tarea cerrada» decía `INBOX.md` para cualquier entrada.** Ahora nombra el
  archivo que hay que borrar cuando la entrada vive en una carpeta.
- **Los avisos del INBOX se cortaban si `INBOX.md` estaba vacío o no existía.** Con las carpetas eso dejaba
  sin revisar entradas que sí había. Ahora sólo el aviso de tamaño depende de `INBOX.md`.
- **La revisión del diff entero encontró tres cosas que se habían escapado**, y se corrigieron con su
  prueba. El comando `flow` de Gemini (`runners/gemini/commands/cauce/flow.toml`) seguía mandando a
  `INBOX.md`. La prohibición «No escribas en» de `report-write` y del borrador de `onboard` quedó nombrando
  sólo la carpeta, así que dejaba escribir en `INBOX.md` y duplicar lo que escribe el paso siguiente; ahora
  nombra los dos lados. Y el aviso de nombre exigía quitar las tildes, algo que el prompt no pide; ahora
  acepta el nombre con tilde o sin ella. La misma revisión confirmó que no hay otro lector que lea sólo
  `INBOX.md` y que ningún guard limita qué se escribe bajo `planning/`.

Prueba real:

- **La reproducción del caso, con git de verdad**, en `test/planning/inbox-entries.test.js`. El control —dos
  ramas que anotan en la sección Propuestas de `INBOX.md`— choca y nombra `planning/INBOX.md`. Eso muestra que
  el escenario reproduce el caso. Las mismas dos ramas, cada una con su archivo en `inbox/propuestas/`, se
  traen con exit 0 y el lector devuelve las dos entradas.
- **Una sesión real de Claude** (`claude -p`, USD 0,27) sobre un banco `suelto` con el motor de esta rama
  congelado. Recibió el prompt de `review-noted` tal como lo arma el arnés de `autobuild`, con dos
  propuestas, y escribió:

  ```
  planning/inbox/propuestas/cache-de-precios.md
  - **cache-de-precios** — el listado recalcula precios en cada request; cachearlos por minuto (autobuild · T-1 · 2026-09-08)
  planning/inbox/propuestas/reintentos-pagos.md
  - **reintentos-pagos** — el cliente de pagos no reintenta un 503 (autobuild · T-1 · 2026-09-08)
  ```

  `git status` de `INBOX.md` quedó vacío. `tree` pasó de `0 propuestas` a `2 propuestas`, y `check` salió
  `ok=true` sin avisos del INBOX. `flow` y `onboard` usan el mismo fragmento y quedaron probados con el arnés,
  no con una sesión real.
- **Seis mutaciones en una copia, cada una en rojo por su prueba:**
  - Sin leer las carpetas: rojos el lector, los avisos y la reproducción con git.
  - Sin los avisos de carpeta: rojos el aviso directo y el que sale por `check`.
  - Con el rótulo fijo en `INBOX.md`: rojo el aviso de entrada promovida.
  - Con el prompt de lecciones de `autobuild` devuelto a «la sección Lecciones de `INBOX.md`»: rojas las dos
    pruebas del cierre.
  - Con `report-inbox` sin la instrucción de un archivo por entrada: rojo el de `flow`.
  - Con las preguntas de `onboard` devueltas a la sección Ideas: rojo el de `onboard`.
