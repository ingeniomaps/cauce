---
caso: 121
titulo: La puerta barata no ve ninguno de los defectos de enunciado que Ready rechaza, así que se pagan con una corrida entera de agentes
estado: abierto
prioridad: alta
version-detectada: 0.82.0
---

# 121 — `check` sale en verde sobre la tarea que el recorrido va a rechazar tres fases más tarde

**🔴 abierto**

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
