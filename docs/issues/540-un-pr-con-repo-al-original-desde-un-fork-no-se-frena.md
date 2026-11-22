---
caso: 540
titulo: un `gh pr create --repo` que nombra el original desde un fork pasa, y R10 dice que el destino se comprueba
estado: abierto
prioridad: media
version-detectada: 0.124.0
---

# 540 — un `gh pr create --repo` que nombra el original desde un fork pasa, y R10 dice que el destino se comprueba

**🔴 abierto** · detectado en 0.124.0 · prioridad **media**: un PR mal apuntado no tiene vuelta atrás (R10: «lo ven, les
llega la notificación, y cerrarlo no deshace nada»). Una instancia real lo frena por su cuenta. Y pasó: el 2026-09-07,
en otro proyecto, se abrieron tres PR contra el original saltándose el fork, por suposición.

## Resumen

`delivery` frena `gh pr create` sin `--repo`, porque en un fork `gh` resuelve el destino al original
(`engine/hooks/delivery.js:95-100`). Con `--repo` puesto no frena nada, sea cual sea el repositorio que nombra. El
comentario de esa regla dice «Con el destino nombrado no se frena (R10: a dónde se publica se decide y se comprueba)».
Decidirlo se cumple: el agente lo escribe. Comprobarlo no lo hace nadie.

R10 (`template/planning/rules/system/commits.md`) dice qué hay que comprobar: «lo que se publica va al repositorio en
el que se está trabajando. Si ese remoto es un fork, va al fork». Un `--repo org/app` desde un checkout cuyo `origin` es
`me/app` es justo lo que R10 prohíbe sin pedido explícito, y pasa.

## Reproducción

Sin modelo. Un repositorio con `origin` en `me/app` y `upstream` en `org/app`, y `execute('destructive', …)` del arnés
de guards:

```
PASA  gh pr create --repo org/app --base develop --fill
PASA  gh pr create --repo me/app --base develop --fill
FRENA gh pr comment 5 --repo org/app --body x
```

La primera tendría que frenar y no frena. La segunda es la correcta y tiene que seguir pasando. La tercera es el
control: comentar frena siempre, con o sin destino.

## Síntoma

El freno de hoy enseña a escribir `--repo`, y no dice cuál. Un agente que lo corrige con el repositorio que tiene a
la vista —el `upstream`, el que nombra el README, el de un PR anterior— abre el PR en el repositorio de otro equipo,
con el freno satisfecho. Es la forma del 2026-09-07: el destino se dedujo del contexto, que R10 dice que no es una
autorización.

## Causa raíz

El 225 cerró la forma («sin destino») y dejó el contenido («qué destino») a la persona, sin decirlo en la regla. El
comentario de `delivery.js:96-97` cita el «se comprueba» de R10 como si el `--repo` lo cumpliera.

## Fix propuesto

Para `gh pr create --repo <dueño>/<nombre>`, comparar el repositorio nombrado con el `origin` del checkout donde corre
`gh`:

- Si coinciden, pasa como hoy.
- Si no coinciden, frena con un ítem `gh pr create --repo <dueño>/<nombre>`. Se aprueba como el resto: por el diálogo,
  con una orden en el chat que nombre ese repositorio o con la línea en `.ops-approval`. Ahí entran los PR que una
  instancia autoriza de antemano en sus reglas.
- Sin `origin`, o con un `origin` que no es de GitHub, frena: sin eso no hay contra qué comprobar, y frenar es la
  dirección segura.

El checkout es el `cwd` de la llamada, o el que nombra un `cd <dir> &&` al principio del comando, que es donde `gh`
resuelve. El motor no lee hoy el `origin` en ningún guard (`grep -rn get-url engine` sólo encuentra la lista de
lecturas de `line-scope.js:185`), así que esto es código nuevo: `git -C <dir> remote get-url origin`.

## Tradeoffs

- **Equipo sin fork:** si el `origin` es el repositorio de la organización, `--repo org/app` coincide y pasa. No cambia
  nada para quien trabaja directo en el original.
- **Un PR a otro repositorio propio** (`--repo me/otro` desde `me/app`) frena. Es poco común, y la salida es aprobarlo.
  Comparar sólo el dueño lo dejaría pasar, pero también dejaría pasar un fork en la organización; se compara el
  repositorio entero.
- **Sidecar:** el agente suele estar en la instancia y el PR es del producto. Si corre `gh pr create --repo` desde la
  instancia, el `origin` es el de la instancia y frena. Es lo correcto (`gh` también resolvería desde ahí), pero hay que
  medir que el mensaje diga desde dónde comparó, para que la salida sea correr desde el producto y no aprobar a ciegas.
- **La URL del `origin` puede traer una credencial** (caso 530). El guard la usa para comparar y no la imprime: el
  mensaje nombra sólo `<dueño>/<nombre>`.
- **Es un freno nuevo sobre algo que hoy pasa.** No es una quita, así que no pide comparar antes y después, pero baja a
  todas las instancias con `delivery`. La aserción es que `--repo` igual al `origin` siga pasando.

## Contexto de descubrimiento

Paso 3 de la auditoría de una instancia (2026-11-21), ítem 9 del nivel 2: «`--repo` apuntado al upstream comparando
contra la cuenta del `origin`». El guard de entrega de la instancia lo hace leyendo `git remote get-url origin` y
compara la cuenta. Su encabezado dice por qué: el fork es el de cada persona, y no puede escribirse uno para todos. La
otra instancia que construyó su propio guard de entrega sólo exige `--repo`, igual que Cauce hoy.

## Relacionados

- 225: `delivery` y el freno de `gh pr create` sin `--repo`.
- 446: dónde vale una aprobación de `gh`.
- 530: la credencial en la URL de un remoto, que esta lectura no tiene que imprimir.
- 539: el mismo guard, otro defecto (las formas por la API).
