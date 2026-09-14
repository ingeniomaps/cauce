---
caso: 142
titulo: Una propuesta firmada sobre el molde no se puede aplicar ni archivar, y mientras tanto impide que su cargo vuelva a proponer
estado: resuelto
resuelto-en: 0.88.0
prioridad: alta
version-detectada: 0.87.0
---

# 142 — Siete propuestas sin salida, y cada una congelando el ciclo de su cargo

**🟢 resuelto en 0.88.0** · detectado en 0.87.0 · prioridad **alta** — el ciclo podía entrar en un estado
del que no salía por ningún camino

## Resumen

El 135 cerró la mitad: una propuesta que nadie decidió ya no se puede **sellar**. Lo que quedó es el
callejón que eso destapa, y es peor que el defecto original.

Una propuesta firmada sobre el molde intacto no tiene ninguna salida:

- **No se puede aplicar**, porque `agent-promote` y `seal` la rechazan: no decide nada.
- **No se puede archivar**, porque `archive` se niega ante cualquier documento firmado —«lo que sigue es
  aplicarla con agent-promote, no archivarla»—.
- **Y bloquea al cargo**: `prepareProposal` no abre otra mientras la anterior no esté `applied`, así que
  ese cargo no vuelve a proponer nunca.

Pasó con siete cargos el 2026-09-14: `qa-engineer`, `security-engineer`, `release-manager`,
`kyc-aml-specialist`, `frontend-engineer`, `finops-engineer` y `database-administrator`.

## Reproducción

```bash
# Sobre una copia del repositorio, con las siete propuestas 2026-09-r2 firmadas:
node engine/cli/ops.js learn security-engineer --applied  --period 2026-09
node engine/cli/ops.js learn security-engineer --archived --period 2026-09
```

## Síntoma

Corrido el 2026-09-14, antes del arreglo:

```
aplicar:  2026-09-r2.md todavía no la decidió nadie: «Aprobación humana» necesita un responsable…
archivar: 2026-09-r2.md está firmada: lo que sigue es aplicarla con agent-promote, no archivarla.
```

Cada comando manda al otro. Y `prepareProposal` sobre ese cargo devuelve `created: false` con
`file: (ninguno)`, para siempre.

## Causa raíz

Tres decisiones correctas por separado que juntas cierran la salida.

- `engine/agents/learning-seal.js:102` — la guarda de `archive` mira **sólo** si está firmada. Su razón es
  buena: si alguien aprobó un cambio, archivarlo lo tiraría. No contempla que la firma se haya gastado
  sobre un documento que no aprueba nada.
- `engine/agents/learning.js:322` — `prepareProposal` bloquea mientras la anterior no sea `applied`.
  `archived` es el otro destino que cierra una propuesta —`CLOSED` ya lo dice en
  `learning-sources.js`— y no estaba contemplado acá, así que una archivada también congelaba el período.
- `engine/agents/learning-seal.js:121` — al archivar, el cuerpo sólo sustituía «pendiente». Una firmada
  llega diciendo «aprobada», así que quedaba `status: archived` con «- Estado: aprobada»: la misma
  contradicción entre frontmatter y cuerpo que el comentario de `seal` describe, por el otro destino.

## Fix propuesto

No está decidido. Tres formas para la primera pieza.

1. **Archivar acepta una firmada si no decide nada.** La guarda pregunta lo que de verdad importa —si hay
   una decisión que tirar— en vez de mirar sólo la firma. Reusa el `undecided` que el 135 dejó en el
   módulo común, así que no agrega criterio nuevo.
2. **Un comando aparte para descartar.** Más explícito y más superficie: otro verbo, otra fila de
   historial, otra puerta. Para una condición que no debería volver a ocurrir.
3. **Desfirmar y después archivar.** Dos pasos y un estado intermedio que hoy no existe, y deja el
   documento diciendo que nadie lo firmó cuando alguien lo hizo.

## Tradeoffs

- **La 1 afloja una guarda**, y eso hay que mirarlo de cerca: si el criterio se equivoca, se archiva
  trabajo aprobado. Por eso la condición tiene que ser exactamente «no decide nada» y no «se parece al
  molde».
- **La fila del historial puede mentir.** `archive` escribe «Se miró y no cambia nada», que es cierto
  cuando alguien miró. Sobre estas siete sería falso: nadie miró, se firmó un andamio.
- **Desbloquear con `CLOSED` es chico y alcanza**: no hace falta un estado nuevo, porque archivada ya
  significa cerrada en el resto del motor.

## Prioridad

**Alta.** No es que algo salga mal: es que no hay salida. Un cargo en ese estado deja de aprender y la
única forma de sacarlo era editar el frontmatter a mano, que es justo lo que el ciclo existe para no
pedirle a nadie.

## Contexto de descubrimiento

Salió de cerrar el 135. Al comprobar que las siete ya no se podían sellar apareció la pregunta obvia —«¿y
entonces qué se hace con ellas?»— y las dos salidas estaban cerradas.

## Relacionados

- **135** — el defecto que dejó a las siete firmadas sin decidir.
- **136** — la otra mitad de la misma corrida.

## Cierre

**🟢 resuelto en 0.88.0** · `engine/agents/learning-seal.js`, `engine/agents/learning.js`,
`engine/agents/learning-files.js`, `engine/agents/learning-sources.js`, `engine/cli/catalog.js`,
`test/agents/learning.test.js`

Se tomó la **opción 1**, y con ella dos correcciones que aparecieron al construirla.

### Contra lo que el caso enumeró

- **«No se puede archivar»** — arreglado: la guarda ahora pregunta si hay una decisión que tirar. Una
  firmada **que decide** sigue sin poder archivarse, que es la conducta que había que conservar.
- **«Y bloquea al cargo»** — arreglado usando `CLOSED`, que ya existía. `SIGNED` y `CLOSED` se movieron a
  `learning-files.js`, el módulo que los dos lados requieren, en vez de duplicarlos.
- **«No se puede aplicar»** — **sin cambios y a propósito**: que una propuesta sin decidir no se aplique
  es lo correcto, y es lo que el 135 construyó. Lo que faltaba era la otra salida.
- **Opción 2, un comando aparte** — se decidió que no: agrega verbo, fila y puerta para una condición que
  el 135 ya vuelve difícil de producir.
- **Opción 3, desfirmar** — se decidió que no: deja el documento diciendo que nadie firmó cuando alguien
  firmó, y eso es peor que el problema.
- **Tradeoff «la 1 afloja una guarda»** — por eso la condición es `undecided` y no una semejanza, y por
  eso el caso que la protege comprueba las dos direcciones.
- **Tradeoff «la fila del historial puede mentir»** — arreglado: archivar sin decidir escribe «Se archivó
  sin decidir: el documento quedó con el molde», y el mensaje del CLI dice lo mismo en vez de afirmar
  «se miró y no cambia nada».

### Lo que el caso no preveía

- **El documento archivado se contradecía.** Al aceptar una firmada, el cuerpo llegaba en «aprobada» y la
  sustitución sólo miraba «pendiente»: quedaba `status: archived` con «- Estado: aprobada». Se usa
  `UNSEALED`, igual que `seal`.
- **La primera versión de la prueba del desbloqueo no medía nada.** Archivaba una propuesta de `2099-01` y
  pedía otra de `2099-02`; como `lastOfPeriod` filtra por período, `previous` venía vacío y la comparación
  ni siquiera ocurría. La mutación sobrevivió y lo dijo. La prueba que muerde archiva y vuelve a pedir
  **del mismo período**, que es lo que le pasó a las siete.

### Qué se corrió

- **Rojo previo, en copia por `tar` y con verde de control**: 26/26 intactas. Revertir la guarda de
  `archive` mata la prueba de la firmada; revertir `UNSEALED` mata la misma por su otra aserción; revertir
  `CLOSED` mata la del archivado. Ninguna mata a las demás.
- **Contra las siete propuestas reales**: las siete pasan de no tener salida a `status: archived`, y el
  cargo vuelve a proponer — `prepareProposal` devuelve `created: true` con `2026-09-r3.md`.
- **Los dos mensajes del CLI, corridos**: sobre una firmada sin decidir dice «nadie decidió el cambio y el
  documento quedó con el molde»; sobre una mirada, «se miró y no cambia nada».
- **Verde**: `npm run ci` en 0 y **813 pruebas**.
