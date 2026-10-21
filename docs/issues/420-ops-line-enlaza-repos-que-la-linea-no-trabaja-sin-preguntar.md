---
caso: 420
titulo: ops line enlaza en la línea todos los repos que no trabaja, sin preguntar ni comprobar que alguno los nombre
estado: resuelto
resuelto-en: 0.113.0
prioridad: media
version-detectada: 0.112.0
---

# 420 — `ops line` llena la carpeta de la línea con enlaces a los repos que no trabaja, aunque ninguno los use, y la persona lo lee como repos metidos en la línea

**🟢 resuelto en 0.113.0** · detectado en 0.112.0 · prioridad **media**. Es un caso de diseño, como el 394 que introdujo el enlazado.

## Resumen

`linkSiblings` (`engine/cli/lines.js:39-45`, llamado en `:261`) enlaza en `lines/<línea>/` **cada** repositorio de la
carpeta de sesión que la línea no trabaja, para que un `../shared-lib` escrito en un repo resuelva igual que desde la
carpeta de sesión (comentario de `:11-13`; caso 394, línea 148). No hay opción para no hacerlo, y no se mira si algún repo
de la línea nombra a esos vecinos.

La razón vale para un workspace donde un repo depende de otro por ruta relativa. Donde no, los enlaces no sirven y además
confunden: la persona abre `lines/<línea>/`, ve cuatro entradas con nombre de repositorio y entiende que la línea trabaja
cuatro repos, cuando trabaja uno. La salida de `ops line` lo agrava, porque los lista al lado del árbol sin decir que
son sólo enlaces (`enlazados: …`, `:286`) ni por qué están.

## Reproducción

El 2026-10-20 en una instancia sidecar (Claude Code, Cauce 0.112.0), con cinco carpetas en la sesión
(`plataforma`, `fuentes`, `landing`, `marca` y la instancia):

```
$ node tools/ops.js line . piloto plataforma
✓ <sesión>/lines/piloto/plataforma  (line/piloto)
  sale de: main
  enlazados: fuentes, landing, marca
```

`ls -la lines/piloto` muestra `plataforma/` y tres enlaces a los checkouts originales. `git grep -nE
"\.\./(fuentes|landing|marca)"` en `plataforma` no devuelve nada: ningún archivo del único repo de la línea nombra a
los vecinos enlazados. La persona lo leyó como «la línea ya tiene repositorios, y debería estar vacía hasta decidir qué
tocar», y pidió explícitamente que esto vuelva a Cauce: «si cauce hace las lineas con enlaces tampoco parece coherente».

## Qué haría falta

- Enlazar sólo lo que haga falta: un vecino que algún repo de la línea nombra por ruta relativa, o que la persona declara
  (`"lines": { "piloto": { "repos": [...], "links": [...] } }` o una bandera de `ops line`). Sin ninguna de las dos, no
  enlazar nada.
- Si se mantiene el enlazado por defecto, que la salida diga qué es y por qué («enlazados, no se trabajan: para que `../`
  resuelva igual»), y que `ops lines` los separe de los árboles.
- Vale mirar si el enlace a un repo de la sesión que no es de la línea abre una escritura a un checkout ajeno desde dentro
  del árbol de la línea, que es lo que un worktree aparte existe para evitar.

## Cierre

**Resuelto en 0.113.0, distinto de lo que el caso proponía:** una línea no enlaza nada. Lo decidió el dueño el
2026-10-20 —«no quiero tener enlaces simbólicos y que ademas no aportan ningun valor con la nueva forma de la linea»—,
y retoma lo que ya había quedado decidido para la carpeta de sesión: en la línea no hay más que sus árboles. El
enlazado venía del caso 394, que lo conservó a propósito para que un `../shared-lib` resolviera igual; el 408 lo había
reforzado al reemplazar un enlace por su árbol.

`linkSiblings` y `linkIfMissing` salieron de `engine/cli/lines.js`. En su lugar `unlinkSiblings` (`:36`), que corre antes
de armar los árboles (`:209`), saca los enlaces que dejó la versión de antes: sólo un enlace que lleva al mismo lugar
de la carpeta de sesión, nunca adonde apunta ni uno que puso otro, y sólo las carpetas que quedaron vacías por eso. La
salida lo dice: `sin los enlaces de antes: … (una línea ya no enlaza lo que no trabaja)`. Con eso, lo que el 408
resolvía para un repositorio enlazado que se suma sigue andando, y lo que hacía para reponer el enlace si `git worktree
add` fallaba ya no tiene objeto y salió: con la rama ocupada, en la ruta del árbol no queda nada.

El enunciado, ítem por ítem:

- **Enlazar sólo lo que haga falta, detectado o declarado**: se decidió que no, por lo de arriba. El vecino que un
  repositorio nombra por ruta relativa se suma a la línea, con su árbol y en su rama: `teamwork.md` lo dice.
- **Si se mantiene el enlazado, que la salida diga qué es**: no aplica, porque no se mantiene. La salida nombra sólo los
  enlaces de antes que saca.
- **Mirar si el enlace abre una escritura a un checkout ajeno**: se miró, y sí: un `Write` por el enlace y un `echo >
  ../shared-lib/…` desde el árbol pasaron los guards. Pero también pasó escribir directo en el checkout de la principal,
  sin enlace de por medio, así que el hueco no era del enlace: salió como el caso 422.

**Lo que se corrió para saber que funciona.**

- `test/wiring/lines.test.js`: «una línea vive en lines/<línea>/<repo>…» afirma que la carpeta de la línea tiene sólo su
  árbol y que la salida no habla de enlaces; «ops line saca los enlaces de antes…» saca dos enlaces simulados, conserva
  uno que lleva a otro lado, una carpeta real y un enlace roto, y arma el árbol de un repositorio que estaba enlazado; «sumar
  un repositorio anidado saca el enlace de antes…» lo mismo un nivel abajo, sin que los hermanos vuelvan; «un repositorio
  anidado se arma en su ruta…» arma uno anidado sin hermanos al lado, y `ops lines join` saca un enlace de antes sin tocar
  adonde lleva.
- Mutaciones en una copia fuera del árbol, las cinco en rojo: `lines.js` de la versión anterior, que enlaza («Expected
  values to be strictly deep-equal», la carpeta de la línea traía los vecinos); no sacar el enlace; sacar cualquier enlace;
  borrar carpetas vacías que no vació la limpieza, y limpiar después de armar en vez de antes.
- `ops line` corrido sobre un banco `ops bench sidecar` con dos vecinos (`shared-lib`, `landing`): la línea nueva dejó
  `lines/piloto/` con sólo `app`; con dos enlaces simulados de la versión de antes, `ops line . piloto` contestó `sin los
  enlaces de antes: landing, shared-lib`, la carpeta quedó con `app` y los dos vecinos siguieron en su lugar.

