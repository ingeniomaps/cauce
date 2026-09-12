---
caso: 121
titulo: La puerta barata no ve ninguno de los defectos de enunciado que Ready rechaza, así que se pagan con una corrida entera de agentes
estado: resuelto
resuelto-en: 0.86.0
prioridad: alta
version-detectada: 0.82.0
---

# 121 — `check` sale en verde sobre la tarea que el recorrido va a rechazar tres fases más tarde

**🟢 resuelto en 0.86.0**

## Resumen

`ops check` valida la forma de una tarea —que las secciones estén, que la aceptación exista, que la razón
de no partir esté escrita— y **no mira nada de lo que Ready rechaza**. El resultado es que un enunciado
defectuoso pasa la puerta que cuesta milisegundos y se descubre en la fase 4 de un recorrido, después de
haber convocado agentes para Triage, Pick, Claim y Decompose.

Medido en la corrida del 2026-09-11 que cerró el caso 105: **tres paradas consecutivas, 402 k + 402 k +
406 k = 1,21 M tokens**, y `check` salió en verde las tres veces. Sobre un total de 3,2 M gastados para
obtener un veredicto, es el **38 %**.

Son dos daños y conviene no confundirlos:

1. **El costo**: cada defecto de enunciado cuesta una corrida de agentes en vez de una corrida de puerta.
2. **La señal equivocada**: `check` en verde se lee como «la tarea está lista», y no lo dice. Quien lanza
   el recorrido no tiene cómo saber que la puerta no mira eso.

## Reproducción

Lo caro es la corrida, pero **el defecto se reproduce barato**: lo que hay que mostrar es que `check` pasa
sobre un enunciado que Ready rechazaría, no que Ready lo rechaza.

```bash
cd "$(mktemp -d)"
node <ruta-al-motor>/engine/cli/ops.js init acme-ops --name Acme --mode sidecar --no-install
cd acme-ops
# Una tarea cuya aceptación tiene el defecto 2 de la corrida real: la condición es inasercible
# porque toda cadena incluye a la cadena vacía.
cat > planning/wip/t-001.md <<'EOF'
# t-001 — Validar el nombre de cliente

## Aceptación
- El alta rechaza un nombre vacío.
- El mensaje de error no incluye el valor recibido.
EOF
node <ruta-al-motor>/engine/cli/ops.js check planning
echo "código: $?"
```

## Síntoma

```
✓ planning/ válido
código: 0
```

Y la misma tarea, en la fase Ready de una corrida real:

```
Ready: no listo — «el mensaje no incluye el valor recibido» no se puede aserciar con '' como único
caso: toda cadena incluye a la cadena vacía. Falta decidir qué otros valores cuentan como nombre vacío.
```

## Causa raíz

No hay una línea que esté mal: hay una comprobación que no existe. `engine/cli/planning.js` valida
estructura —secciones presentes, formato de las filas, la razón de `(sin partir: …)` que pide R17— y no
tiene ningún chequeo sobre el **contenido** de una condición de aceptación.

Los tres defectos que Ready encontró en la corrida real, y que ninguna comprobación de `check` mira:

- La aceptación deja sin decidir qué cuenta como «nombre vacío» además de `''`.
- Una condición inasercible por construcción: «el mensaje no incluye el valor recibido», con `''` como
  único caso, es verdadera para toda cadena.
- Filas de `HUMAN_ACTIONS.md` marcadas `resuelta` sin rastro en disco de ninguna decisión — Ready las leyó
  como aprobación autoservida, y tenía razón.

El tercero es el más interesante porque **sí es mecanizable**: que una fila pasó a `resuelta` sin que
ningún commit la toque es una pregunta que `git log` contesta, y no hace falta un agente para hacerla.

## Fix propuesto

No está decidido, y la decisión es parte del caso. Tres formas, de menos a más ambiciosa:

1. **Sólo la tercera.** `check` avisa cuando una fila de `HUMAN_ACTIONS.md` está `resuelta` y el archivo no
   tiene un commit que la haya cambiado. Es barato, es determinista y cubre el defecto que más caro salió.
2. **Un aviso de aceptación sospechosa.** Heurísticas angostas y sin red: una condición que nombra un único
   valor literal, una que usa «incluye»/«contiene» sobre un valor que puede ser vacío. Avisa, no falla.
3. **Una fase de crítica de enunciado antes de Pick**, con un solo agente barato en vez de cuatro fases.
   Cambia el recorrido; es la que hay que pensar más.

Lo que **no** es el fix: hacer que `check` falle. Una puerta que rechaza enunciados por heurística frena
trabajo legítimo, y el aviso alcanza para que quien lanza la corrida mire antes de gastar 400 k.

## Tradeoffs

- La opción 2 puede volverse ruidosa y **no está medido** cuántas aceptaciones legítimas marcaría. Hace
  falta pasarla por las tareas de `done/` de una instancia real antes de decidir el umbral.
- La opción 1 necesita un repositorio para contestar, y una instancia recién creada no lo tiene: hay que
  degradar sin avisar de más, como hizo el 086 con las migraciones.
- Cualquiera de las tres mueve trabajo de Ready a `check`, y Ready seguirá existiendo: el riesgo es creer
  que la puerta ahora sí cubre el enunciado, que es el mismo error de lectura que este caso denuncia.

## Prioridad

**Alta.** Es el único modo de desperdicio de esta tanda que tiene un número medido, y es grande: 1,21 M
tokens y tres corridas en una sola medición. Baja a media si una corrida posterior con enunciados
endurecidos no vuelve a parar en Ready — eso diría que el defecto era del banco y no del recorrido.

## Contexto de descubrimiento

Salió midiendo el caso **105**, cuyo cierre lo dejó escrito con todas las letras: «*Eso deja una
observación que este caso no preveía y que no es suya: `check` salió en verde las tres veces. La puerta
barata no ve ninguna de las tres cosas que Ready rechazó… Sale como caso propio si se decide mirarlo.*»

No salió. Lo encontró la auditoría de 0.79→0.83 del 2026-09-12, contrastando los 32 casos cerrados contra
lo que cada uno había enumerado: el ítem estaba archivado dentro de un caso cerrado, que es exactamente lo
que R15 describe.

## Relacionados

- **105** — de donde salió; su cierre tiene los tres defectos de enunciado y los números de cada parada.
- **087** — el precedente de que una parada mal registrada hace repetir la planificación entera.
- **122** y **123** — los otros dos ítems que el mismo contraste encontró sin registrar.

## Cierre

**🟢 resuelto en 0.86.0** · `engine/core/repos.js`, `engine/cli/planning.js`,
`test/planning/human-actions.test.js`

### Contra lo que el caso enumeró

**Opción 1, «sólo la tercera» — elegida por el dueño del producto y hecha.** `check` avisa cuando una fila
de `HUMAN_ACTIONS.md` figura `resuelta` y ningún commit la registró. Se pregunta con el pickaxe de `git log`
sobre la **línea entera** y no por la palabra `resuelta`: lo que hay que establecer es que esa fila, con ese
estado, existió alguna vez en un commit. Una que pasó a resuelta sólo en el árbol de trabajo no aparece en
ninguno, que es exactamente el caso que Ready leyó como aprobación autoservida.

**Opción 2, «un aviso de aceptación sospechosa» — medida el 2026-09-12, y descartada por lo que la medición
mostró.** El caso ponía la condición: pasarla por las tareas de `done/` de una instancia real antes de fijar
el umbral. Se hizo, en sólo lectura, contra las **83 aceptaciones** de `venotal-ops`, y el resultado no es
un umbral mal elegido sino que **la heurística no mide lo que dice medir**.

- **«Una condición que nombra un único valor literal»** marca **12 de 83**, y las 12 son falsos positivos.
  Once citan un identificador —`` `FROM` ``, `` `pnpm run build` ``, `` `src/lib/gemini.ts` ``,
  `` `/diagnostico` ``, `` `global.css` ``— que es lo que hace toda aceptación bien escrita en ese corpus.
  La más elocuente es «el archivo `dashboard/test-loop.txt` existe y contiene el texto "Loop funciona"»:
  es **perfectamente asercible** y la heurística la marcaría igual.
- **«Incluye/contiene sobre un valor que puede ser vacío»** marca **1 de 83** al aplicarle su propio acote
  —sin él eran 8—, y esa única también es legítima: enumera dos condiciones sobre
  `product.imageUrls.split(",")`.

O sea que lo que la heurística detecta es «cita un identificador», no «es inasercible por construcción»,
que era el defecto que Ready rechazó. Bajar el umbral no la arregla y subirlo la apaga. **Lo que la
reactivaría** ya no es un número: es una forma de reconocer una condición inasercible que no pase por
contar literales.

Vale registrar cómo casi se cierra mal. La primera pasada dio **36 y 8** con dos greps que aproximaban las
heurísticas por encima —contaban aceptaciones que *contienen* un literal corto, y las que dicen
«incluye» ignorando el acote del valor vacío—. Con esos números la conclusión habría sido «es ruidosa, 43 %»,
que es una razón distinta y más débil que la verdadera. Lo que cambió el diagnóstico no fue afinar el
regex: fue **leer las 12 marcadas** una por una.

**Opción 3, «una fase de crítica de enunciado antes de Pick» — decidida que no.** Cambia el recorrido, que
es una decisión de producto y no la cola de este caso; el propio enunciado la marca como «la que hay que
pensar más». **La reactiva** que, con la opción 1 puesta, sigan apareciendo paradas en Ready por defectos
de enunciado: eso diría que lo mecanizable no alcanzaba.

**«Lo que no es el fix: hacer que `check` falle»** — respetado. Es `warning`, `check` sigue saliendo 0, y la
prueba lo fija.

**Tradeoff «la opción 1 necesita un repositorio, y una instancia recién creada no lo tiene: hay que degradar
sin avisar de más, como hizo el 086»** — hecho y aserciado en los dos bordes: sin repositorio no dice nada,
y con el archivo todavía sin commitear tampoco. La prueba arranca justamente por ahí, antes de crear el
repositorio, para que la degradación no sea una rama que nadie ejecuta.

**Tradeoff «el riesgo es creer que la puerta ahora sí cubre el enunciado»** — es el ítem más importante de
este cierre y por eso va dicho y no sobreentendido: **`check` sigue sin ver dos de los tres defectos**. La
aceptación que deja sin decidir qué cuenta como «nombre vacío» y la condición inasercible por construcción
pasan la puerta igual que antes. Lo que bajó es el costo del tercero, no la cobertura del enunciado.

**Los dos daños, por separado.** El **costo** queda cubierto sólo para el defecto mecanizable — uno de los
tres de aquella corrida. La **señal equivocada** sigue viva: `check` en verde se sigue leyendo como «la
tarea está lista», y sigue sin decirlo. Cerrar esto sin nombrarlo habría archivado la mitad del caso dentro
de un caso cerrado, que es el defecto que lo originó.

**Prioridad «baja a media si una corrida posterior con enunciados endurecidos no vuelve a parar en Ready»** —
no se midió: no se corrió ningún recorrido después del arreglo. Queda como estaba.

### Qué se corrió

**La medición de la opción 2**, el 2026-09-12, en sólo lectura sobre `planning/done/` de `venotal-ops`:

- **83 aceptaciones**, todas con línea `acept:`, de 83 entradas cerradas. Es trabajo real de una empresa,
  no un banco: aparecen condiciones numeradas, gates nombrados y rutas de archivo.
- **Heurística A** —un solo literal entre comillas y sin enumerar otras condiciones—: **12 de 83**, y se
  leyeron **las 12**, no una muestra. Las 12 son falsos positivos.
- **Heurística B** —«incluye/contiene» **y** mención de valor vacío—: **1 de 83**. Sin el acote del valor
  vacío daba 8, que es lo que contaba la primera pasada.
- El corpus no viaja con el caso y no está en este repositorio; lo que queda acá es el número y el método.

**Lo que probó la opción 1**, que es la que sí se construyó:

- **Rojo previo**, con el motor sin tocar: la prueba pasa su primera aserción —sin repositorio no avisa— y
  falla en la segunda, `actual []` contra el aviso esperado. O sea que el montaje —`git init`, la fila
  commiteada como `pendiente`, el volcado a `resuelta`— sí se ejercitó, y lo único que faltaba era la
  comprobación.
- **Verde**: `tests 2, pass 2, fail 0` con `test/planning/grants.test.js`, y `npm test` entero en **770 de
  770**, con `npm run ci` en 0.
- **Mutaciones**, en copia desechable bajo el scratchpad de la sesión (R23), con la copia verificada en
  verde antes de mutar:
  - quitar la llamada en `check` → `pass 0, fail 1`;
  - invertir el pickaxe —confundir «registrada» con «no registrada»— → `pass 0, fail 1`. Ésta es la que
    importa: sin ella el verde sólo diría que el aviso aparece, no que desaparece cuando el commit existe.
