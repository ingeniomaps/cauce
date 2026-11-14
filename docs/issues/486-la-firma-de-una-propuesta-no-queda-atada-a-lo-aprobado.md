---
caso: 486
titulo: La firma de una propuesta sella la punta de la rama, no el commit que se aprobó
estado: resuelto
resuelto-en: 0.120.0
prioridad: media
version-detectada: 0.119.0
---

# 486 — La firma de una propuesta sella la punta de la rama, no el commit que se aprobó

**🟢 resuelto en 0.120.0** · detectado en 0.119.0 · prioridad **media**: es la única puerta humana del ciclo de aprendizaje, y el ruleset no descarta las aprobaciones viejas (comprobado el 2026-11-05).

## Resumen

`sign-proposal.yml` se dispara con la aprobación de la review, pero hace checkout de la rama del PR tal como está cuando corre el job, no del commit que se aprobó. Lo que se empuje entre la aprobación y el job queda firmado sin que nadie lo haya revisado. Además, nada compara después si la propuesta firmada cambió: «firmada» es una línea de texto, sin huella del contenido.

## Reproducción

**Todavía no se reprodujo.** La que falta, en un repositorio desechable con este workflow:

1. Abrir un PR con una propuesta `- Estado: pendiente`.
2. Aprobar la review y, antes de que el job haga checkout, empujar un commit que cambie «Cambio propuesto».
3. Ver si la propuesta firmada trae el cambio no revisado.

Una vez firmada, se edita «Cambio propuesto» en otro commit y se mira si `agent-promote` la aplica sin decir nada.

## Causa raíz

- `.github/workflows/sign-proposal.yml:42`: `ref: ${{ github.event.pull_request.head.ref }}` es la rama, no `github.event.review.commit_id`.
- `:52`: el push va a esa misma rama.
- `:67-77`: firma toda propuesta con `- Estado: pendiente` que el diff contra `BASE` traiga, sin mirar en qué commit se aprobó.
- `engine/agents/learning-files.js:36`: «firmada» es la regex `^- Estado: aprobada$`, sin huella del contenido.

## Fix propuesto

1. En `sign-proposal.yml`, hacer checkout de `github.event.review.commit_id` y negarse si la punta de la rama ya no es ese commit. El mensaje tiene que nombrar los dos SHA y decir que hay que volver a aprobar.
2. Opcional, y lo decide la persona: que la firma escriba la huella del contenido de «Cambio propuesto», y que `agent-promote` se niegue si no coincide.

## Tradeoffs

- **No hay atenuante en el ruleset.** Comprobado el 2026-11-05 con `gh api repos/ingeniomaps/cauce/rulesets/21259587` (exit 0): el ruleset `main` tiene `dismiss_stale_reviews_on_push: false`, `require_last_push_approval: false` y `required_approving_review_count: 0`. Un push después de aprobar no descarta la aprobación, y la firma ya escrita sigue valiendo aunque después cambie «Cambio propuesto». Si activarlo cerraría el hueco no está comprobado: la firma ya es un commit escrito cuando llega el push siguiente.
- **La firma es un commit nuevo sobre la rama** (AGENTS.md, «Qué clic firma», paso 4). Con el punto 1, la punta deja de coincidir con el commit aprobado apenas el bot firma. La comprobación tiene que hacerse antes de firmar, no después.
- No baja a las instancias: el workflow es de este repositorio. El punto 2 sí bajaría, porque `agent-promote` viaja en el paquete.
- `engine/hooks/approval.js` coteja por ruta y no por contenido a propósito. Este caso no lo toca.

## Contexto de descubrimiento

Sale de la revisión del 2026-11-05 de los repositorios de una organización externa. Su catálogo de reglas ata cada autorización a los bytes revisados con una huella sha256, y la aprobación caduca si cambia algo pertinente.

## Relacionados

- Caso 146: quién abre los PR del ciclo y por qué su CI espera.
- Caso 142: propuestas firmadas con el molde intacto.

## Cierre

Dos candados, uno por hueco:

- **Entre aprobar y firmar.** `sign-proposal.yml` recibe `review.commit_id` como `APPROVED` y, si el PR trae alguna
  propuesta pendiente y la punta de la rama no es ese commit, no firma. Falla nombrando los dos SHA y pide volver a
  aprobar.
- **Después de firmar.** La firma escribe `- Huella: sha256:<hex>` de «Cambio propuesto». `ops learn <cargo>
  --check-signature` la recalcula; `agent-promote` lo corre antes de aplicar y para si no coincide, y `seal` también se
  niega. Una propuesta firmada antes de esta versión no trae huella y se acepta como estaba. Una con la línea rota, no.

La reproducción del caso, con el paso real del workflow sobre un repo y un remoto desechables (decisión de quien firma,
2026-11-13: local y no en GitHub). Aprobado el commit de la propuesta, empujado otro que cambia «Cambio propuesto»:

```
antes:   el paso firma el commit nuevo — «firmó un commit que nadie aprobó»
después: exit 1 · «Aprobaste <aprobado>, pero la rama ya está en <punta>. … volvé a aprobar el PR.»
         la propuesta sigue en «pendiente» y no hay commit de firma
```

La huella, editada después de firmar, por el CLI real en una instancia y por un modelo con el pedido real del paso de
`agent-promote` (`claude -p`, USD 0,28):

```
agents/roles/probe/learning/proposals/2099-06.md: «Cambio propuesto» cambió después de la firma (firmado
sha256:fa3a62c90d6a…, ahora sha256:0386208854b6…). … · exit 1
modelo: {"exitCode": 1, "output": "…cambió después de la firma (firmado sha256:fa3a62c90d6a…, …)"}
```

Contra el caso:

- **Fix 1, checkout del commit aprobado:** se hizo distinto, con la razón. Se hace checkout de la rama y se compara
  contra el commit aprobado. Un checkout del commit dejaría la cabeza suelta y el `git push HEAD:$BRANCH` de la firma
  sin rama, y la comparación prueba lo mismo: lo que se firma es lo que se aprobó.
- **Fix 2, la huella:** se hizo, por decisión de quien firma (2026-11-13).
- **Tradeoff, el ruleset:** no se tocó. El candado vive en el workflow y en el motor, así que no depende de
  `dismiss_stale_reviews_on_push`.
- **Tradeoff, la firma es un commit nuevo:** confirmado que no traba. La comparación corre antes de firmar, y una
  segunda aprobación sobre el commit del bot coincide con la punta y no encuentra nada pendiente.
- **Tradeoff, el punto 2 baja a las instancias:** sí, por `agent-promote` y el CLI. El CHANGELOG lo dice.
- **Tradeoff, `approval.js`:** no se tocó.

Encontrado y no previsto, por la revisión independiente:

- **El chequeo de SHA corría aunque el PR no trajera propuestas**, y dejaba en rojo cualquier PR aprobado cuya rama se
  movió. Ahora corre sólo cuando hay algo que firmar.
- **El `awk` y node calculaban distinto en tres bordes:** sección al final del archivo, dos secciones y sección ausente.
  Igualados, y una prueba compara el `awk` real del workflow con el motor en seis textos.
- **Una línea de huella rota pasaba por firma vieja.** Ahora se niega.
- **`seal` no miraba la huella:** una aplicación a mano, o la de un recorrido que no pasa por `agent-promote`, se
  sellaba en silencio. Ahora se niega.
- **La salida que proponían los mensajes no existía.** Decían «volvé a firmar», pero el workflow sólo firma una
  propuesta en «pendiente», así que aprobar de nuevo no hacía nada. Ahora el mensaje dice la salida real: revertir, o
  devolver «Aprobación humana» al molde, borrar la línea Huella y aprobar otra vez. Lo arma una sola función para
  `seal` y el CLI.
- **Anotado, sin caso:** borrar la línea de huella entera hace que la propuesta pase por firma vieja. Detectarlo pide
  atar «vieja» a algo que no se edite junto con el texto, como la fecha de la firma, y no se hizo.

### Lista de cierre

1. hecho: el paso real de firma sobre un commit empujado después de aprobar, firmándolo, y 36/36 en las pruebas de
   firma y aprendizaje, antes de tocar el código.
2. hecho: la misma rama que el 484 y el 485, a pedido.
3. hecho: `test/repo/ci-sign.test.js`, `test/agents/learning-signature.test.js` y
   `test/workflows/agent-promote-signature.test.js`, en rojo con el código anterior y en verde después.
4. hecho: once mutaciones en una copia, todas en rojo: sin comparar SHA, el `awk` con el título, el motor sin salto
   final o sin quitar el último, el `awk` concatenando secciones, `checkSignature` aceptando siempre, el CLI que no se
   niega, `agent-promote` que ignora el chequeo, una huella rota pasando por vieja, `seal` sin verificar y el SHA
   comparado antes de juntar las pendientes.
5. hecho: la aserción de ausencia es que la propuesta sigue «pendiente» y no hay commit de firma, vista en rojo con el
   paso anterior; antes y después, lado a lado arriba.
6. hecho: el paso real del workflow en un repo y un remoto desechables, el CLI real en una instancia y el pedido real
   del paso de `agent-promote` por un modelo. No en GitHub Actions: lo decidió quien firma, y la próxima firma real lo
   ejercita.
7. hecho: lo que depende de un modelo, que el agente de `agent-promote` reporte el código de salida del chequeo, se
   corrió con uno por `claude -p`. Lo que depende de GitHub Actions no corrió ahí: quien firma decidió cerrarlo con la
   prueba local (confirmado el 2026-11-14), y la primera firma real de diciembre lo ejercita («Sin probar»).
8. hecho: corrieron el paso real, el CLI, `claude -p` y las pruebas, sobre el código final.
9. hecho: dos commits (el aprobado y la punta), un PR con propuesta y otro sin, huella intacta, editada, rota y
   ausente, y seis textos en la comparación del `awk` con el motor.
10. hecho: `firmarPropuesta` decía firmar como producción y ahora deja la huella; `seal` y el CLI la verifican; el
    AGENTS.md («Qué clic firma») dice qué pasa si la rama se mueve; `test/wiring/runners-contract.test.js` contaba
    los comandos que dictan los recorridos y la consigna nueva quedó clasificada; `approval.js` no depende de esto.
11. hecho: tres pasadas independientes. La primera dejó cuatro puntos, arreglados; la segunda, dos más —el mensaje
    con una salida que no existía y un comentario partido—, arreglados; la tercera, sobre eso.
12. hecho: pasada uno por uno sobre la versión final, y el tokenizador a 0,22, más el YAML a mano, que el tokenizador
    no lee: quitó una razón que la prueba de firma repetía del workflow.
13. hecho: `npm run ci` en exit 0, con todo stageado.
14. hecho: arriba, contra el caso entero.
15. hecho: arriba y la línea de abajo.
16. hecho: frontmatter y encabezado en 0.120.0, la versión abierta, con su entrada en el CHANGELOG.

**Sin probar:** el workflow en GitHub Actions de verdad, con una aprobación real y un push en el medio. Quien firma
decidió probarlo local; la primera firma real de diciembre lo ejercita.
