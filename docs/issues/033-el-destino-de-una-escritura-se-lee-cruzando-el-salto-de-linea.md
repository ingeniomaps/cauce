---
caso: 033
titulo: El destino de una escritura se lee cruzando el salto de línea cuando más abajo hay un heredoc
estado: resuelto
prioridad: media
version-detectada: 0.62.0
resuelto-en: 0.63.0
---

# 033 — `shell-boundary` acusa una escritura en una ruta que no está en el comando

**🟢 resuelto en 0.63.0** · detectado en 0.62.0 · prioridad **media** — el parser pierde el borde entre comandos

## Resumen

`shell-boundary` resuelve el destino de `cp`, `mv`, `tee`, `install`, `rsync` y las redirecciones. Con
varias líneas en un mismo comando y **un heredoc más abajo**, deja de tratar el salto de línea como
borde: sigue leyendo argumentos de la línea siguiente y se queda con el primer token de ésa como
destino de la escritura anterior.

El bloqueo entonces nombra una ruta que no aparece en el comando. En el caso que lo reveló acusaba una
escritura en `…/gouduet/python3`, que es el intérprete de la línea de abajo, no un archivo.

Falla hacia el lado seguro —bloquea de más— pero el mensaje señala algo que no existe, así que quien lo
lee busca un error que no cometió.

## Reproducción

Cuatro variantes; sólo cambia lo que va después del salto de línea:

```bash
S=/tmp/probe; mkdir -p $S

# A — una sola línea
cp /etc/hostname $S/h1                                    # exit 0

# B — segunda línea sin heredoc
cp /etc/hostname $S/h2
python3 -c "print('B')"                                   # exit 0

# C — segunda línea CON heredoc
cp /etc/hostname $S/h3
python3 - <<'PY'
print('C')
PY
# BLOQUEADO: «el comando escribe en <cwd>/python3, fuera de las raíces»

# D — heredoc, pero sin verbo de escritura arriba
echo hola
python3 - <<'PY'
print('D')
PY                                                        # exit 0
```

*Verificado* el 2026-09-06 sobre 0.62.0, las cuatro en la misma sesión.

A vs. C aísla el heredoc; C vs. D muestra que hace falta un verbo de escritura en la línea previa para
que haya un destino que atribuir mal; B vs. C descarta que el problema sea el salto de línea por sí
solo.

## Causa raíz

`engine/hooks/shell.js`, en el patrón que lee los destinos de `cp` y sus hermanos:

```js
const LAST_ARG = /(?:^|[\s;|&(])(cp|mv|install|rsync)\s+([^;|&<>()]+)/g
```

**La clase de argumentos nunca excluyó el salto de línea.** `[^;|&<>()]` lo admite, así que la lista de
argumentos de `cp` siempre cruzó a la línea siguiente; el heredoc no la extiende, sólo cambia **dónde
frena**. Medido sobre las mismas variantes, leyendo el destino que el patrón saca:

| variante | destino que lee | por qué |
|---|---|---|
| B, sin heredoc | `python3` → descartado | el último token es la marca de lo entrecomillado, y el filtro final la tira |
| C, con heredoc | `python3` | el `<` del heredoc frena la clase justo en un token que sí sobrevive |

O sea que **B no pasa porque el parser respete el salto de línea: pasa de casualidad.** El destino que
lee está igual de mal en las dos, y en una el error se cae solo. Eso importa para la prueba: aserciar
«B pasa» no fija nada.

El mismo error de posición de [030](030-la-exencion-del-mensaje-de-commit-no-ve-un-prefijo-de-entorno.md)
visto desde otro ángulo: ahí se lee mal **dónde empieza** el comando, acá **dónde termina**.

## Fix propuesto

Separar comandos antes de resolver destinos, tratando el salto de línea como borde igual que `;`, `&&`
y `|`, y consumiendo el cuerpo del heredoc como una unidad que pertenece a su propia línea:

Sumar el salto de línea a lo que corta una lista de argumentos, en las tres familias que la leen:

```diff
-const EVERY_ARG = /(?:^|[\s;|&(])(tee|truncate)\s+([^;|&<>()]+)/g
-const LAST_ARG = /(?:^|[\s;|&(])(cp|mv|install|rsync)\s+([^;|&<>()]+)/g
-const SED = /(?:^|[\s;|&(])sed\s+([^;|&<>()]+)/g
+// El salto de línea separa comandos igual que `;`, y sin él la lista de argumentos de un `cp` sigue
+// leyendo la línea de abajo: el destino termina siendo el intérprete del comando siguiente.
+const EVERY_ARG = /(?:^|[\s;|&(])(tee|truncate)\s+([^;|&<>()\n]+)/g
+const LAST_ARG = /(?:^|[\s;|&(])(cp|mv|install|rsync)\s+([^;|&<>()\n]+)/g
+const SED = /(?:^|[\s;|&(])sed\s+([^;|&<>()\n]+)/g
```

Comprobado: con el salto excluido, la variante C lee `api/h3` —el destino real— en vez de `python3`.

**Y no se arregla con el recorte del heredoc que pide el
[032](032-el-cuerpo-de-un-heredoc-se-juzga-como-si-fuera-a-ejecutarse.md).** Se midió: aplicando ese
recorte y dejando la clase como está, C sigue leyendo `python3`, porque la cabecera `<<PY` se conserva
a propósito y es ahí donde la clase frena. Los dos casos comparten el heredoc en el enunciado y no
comparten arreglo; se pueden hacer en cualquier orden.

La prueba que falta es la de las cuatro variantes de arriba, no una sola sobre `cp`: lo que se rompe es
la separación, y sólo se ve cuando el comando tiene más de una línea.

## Tradeoffs

Ninguno visible. Hoy el parser atribuye un destino que el shell nunca le daría, así que corregirlo
acerca el guard a la semántica real. El riesgo a vigilar es el simétrico —que al separar bien se pierda
un destino que antes sí se veía—, y por eso la prueba tiene que cubrir las dos direcciones: un caso que
debe bloquear y otro que debe pasar, ambos multilínea.

## Prioridad

**Media.** No desprotege: bloquea de más. Pero el mensaje nombra una ruta inventada, y un guard que
señala mal enseña a desconfiar de él — que es como termina apagado. Aparece con la forma más común de
escribir un script de varias líneas, así que se cruza seguido.

## Contexto de descubrimiento

En `gouduet`, el 2026-09-06, montando una prueba para verificar los umbrales de R17: el comando copiaba
un directorio y en la línea siguiente abría un `python3 - <<'PY'`. El bloqueo habló de una escritura en
`…/gouduet/python3`, que no era ni el origen ni el destino de nada.

## Relacionados

- [032](032-el-cuerpo-de-un-heredoc-se-juzga-como-si-fuera-a-ejecutarse.md) — el otro defecto que
  aparece con un heredoc delante. **No comparten fix**: se midió, y el recorte del cuerpo no cambia lo
  que este caso lee.
- [022](022-pre-shell-no-juzga-el-destino-de-una-escritura.md) — el caso que pidió este guard. La
  capacidad es correcta; lo que falla es la separación de comandos.
