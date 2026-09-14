---
caso: 143
titulo: El ciclo abre un PR y pide firma sobre una propuesta cuyo «Cambio propuesto» sigue siendo el molde, así que gasta una firma humana sin aportar nada
estado: abierto
prioridad: alta
version-detectada: 0.88.0
---

# 143 — Un PR que no aporta cuesta lo mismo que uno que sí

**🔴 abierto** · detectado en 0.88.0 · prioridad **alta** — siete firmas humanas gastadas sobre documentos
que no decidían nada, y el mecanismo que las produjo sigue igual

## Resumen

El ciclo escribe la propuesta en dos tiempos y sólo el primero está automatizado:

1. `ops learn <cargo> --proposal` compone el documento desde los informes y los veredictos. La sección
   **«Cambio propuesto» queda con el texto del molde**, que es una instrucción para quien va a redactar.
2. `/agent-propose` la llena: «el texto exacto a agregar o reemplazar, archivo por archivo»
   (`automatization/workflows/agent-propose.js:79`).

El job `propose` de `.github/workflows/agent-learning.yml` corre **el primero** y abre el PR. El segundo no
lo corre nadie, y nada avisa que falta. Quien recibe el PR firma un documento que no decidió nada.

**El principio ya está escrito en el propio motor**, y aplicado a medias. `prepareProposal` se niega a
abrir documento cuando no hay material, y su comentario lo dice con todas las letras: «un documento que no
puede decir qué corregir no produce un cambio de contrato, y cuesta igual la firma humana que uno que sí».
Ese criterio cubre «no hay material» y **no** cubre «hay material y nadie decidió el cambio», que es el
caso que llegó a producción.

Lo mismo hacen los otros jobs del repositorio: abren PR cuando hay algo que aportar y se callan cuando no
—el propio `propose` tiene su paso «Say when there was nothing to propose», que termina en verde y sin
PR—. Lo que falta es que esa misma pregunta cubra el documento sin decidir.

## Reproducción

```bash
# Un cargo con su propuesta del período aplicada y material nuevo (un informe con recomendación
# o un caso en rojo sin sellar):
cd <instancia> && node <engine>/cli/ops.js learn <cargo> --proposal
```

El documento se compone, el job detecta cambios en el árbol —la propuesta nueva más los informes que
selló— y abre el PR.

## Síntoma

Ocurrido el 2026-09-14 con **siete cargos**: `qa-engineer`, `security-engineer`, `release-manager`,
`kyc-aml-specialist`, `frontend-engineer`, `finops-engineer` y `database-administrator`. Los siete PRs se
abrieron, se firmaron y se mergearon. Las siete propuestas traían la misma sección «Cambio propuesto»,
carácter por carácter:

```
## Cambio propuesto

Una revisión suele **no** ser aditiva: reemplaza texto que la propuesta anterior agregó. Decilo
explícitamente y decí por qué la aditividad no aplica acá — vale para lo que ya rindió sus casos, no para
un texto que acaba de fallar su primera medición.
```

Ninguna se pudo aplicar. Las siete terminaron archivadas sin decidir (casos 135 y 142).

## Causa raíz

`.github/workflows/agent-learning.yml`, job `propose`. El paso «Detect changes» pregunta por
`git status --porcelain`, y componer la propuesta **siempre** deja cambios: el documento nuevo y los
informes que se sellaron al consumirlos. Así que `changed=true` y el PR se abre, decida o no decida algo.

La pregunta que falta no es «¿cambió algo en el árbol?» sino «¿este documento aporta algo que firmar?».

## Fix propuesto

No está decidido, y la elección cambia quién hace el trabajo.

1. **Que el motor lo diga y el job lo lea.** `prepareProposal` ya devuelve un objeto; que informe si el
   documento quedó sin decidir —`undecided` vive en `engine/agents/learning-files.js` desde 0.88.0— y que
   el job no abra PR en ese caso, con la anotación que ya usa para «nada que proponer». **Hay un cabo que
   resolver**: los informes se sellan al componer, así que sin PR ese sello se queda en el runner y el mes
   siguiente el mismo material entra de nuevo. O se stagean los sellos igual, o no se sella hasta que haya
   documento que valga.
2. **Que el ciclo corra `/agent-propose`.** Es el paso que falta para que el ciclo se complete solo. La
   infraestructura existe —el job `research` instala el CLI y llama a `claude -p`—, pero `propose` fue
   diseñado a propósito **sin modelo**, y cambiarlo mueve el costo y la superficie del ciclo.
3. **Que el PR lo declare.** Título y cuerpo marcan «sin cambio decidido». Es lo más barato y lo que menos
   arregla: no impide firmar, y lo que este caso muestra es que se firma igual.

## Tradeoffs

- **La 1 hace que el ciclo produzca menos PRs**, y eso se va a leer como una regresión. No lo es: hoy
  produce documentos que no se pueden aplicar. Pero deja el ciclo **incompleto** hasta que alguien corra
  `/agent-propose` a mano, y eso hay que decirlo donde se vea.
- **La 2 es la única que cierra el ciclo**, y es la que más cambia: mete un modelo en un job que
  deliberadamente no lo tenía, con su credencial y su costo por cargo.
- **El check `proposal-pr` no es el lugar.** Avisa y no falla **a propósito** —su comentario dice que
  bloquear prohibiría que un compañero apruebe el PR que abrió otro—, y su criterio es sobre quién abrió
  el PR, no sobre si el documento aporta.
- **Un aviso no alcanza para esto.** El 2026-09-14 el PR decía «requiere evaluación y aprobación humana» y
  se firmó igual siete veces.

## Prioridad

**Alta.** El recurso que este ciclo existe para proteger es la firma humana, y el defecto la gasta a
cambio de nada. Gastó siete en un día, y ninguno de los tres arreglos de 0.88.0 lo toca: aquéllos impiden
que un documento sin decidir **termine** el ciclo, no que **empiece** pidiendo una firma.

## Contexto de descubrimiento

Salió de cerrar el 135 y el 142. Con los dos arreglados, una propuesta sin decidir ya no se puede sellar y
ya no bloquea a su cargo — pero el PR se sigue abriendo y la firma se sigue pidiendo. La observación es de
quien recibió los siete: «parece que ni siquiera debieron hacer un PR para firmar».

## Relacionados

- **135** — el placeholder que el criterio de «sin decidir» no reconocía.
- **142** — el callejón que quedó: ni aplicar ni archivar, y bloqueando.
