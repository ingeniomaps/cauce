---
caso: 167
titulo: `rm -r` sobre la raíz o el home no se frena si el destino va entre comillas, con llaves, detrás de `--` o con barra final
estado: resuelto
resuelto-en: 0.95.0
prioridad: alta
version-detectada: 0.94.0
---

# 167 — El destino catastrófico entrecomillado pasa

**🟢 resuelto en 0.95.0** · detectado en 0.94.0 · prioridad **alta** — y la forma que pasaba es la que
escribe quien cita bien sus variables

## Resumen

La regla que R23 sostiene —`rm -r` sobre la raíz, el home o el directorio padre— reconocía el destino
sólo desnudo. Con una comilla, con llaves, detrás de `--` o con una barra al final, el mismo borrado
pasaba.

## Reproducción

Contra el guard real:

```
BLOQUEA ← rm -rf /
PASA    ← rm -rf "/"
PASA    ← rm -rf '/'
BLOQUEA ← rm -rf ~
BLOQUEA ← rm -rf $HOME
PASA    ← rm -rf "$HOME"
PASA    ← rm -rf ${HOME}
PASA    ← rm -rf $HOME/
PASA    ← rm -rf -- /
BLOQUEA ← rm -rf ..
```

## Por qué es la peor de las tres formas

`rm -rf "$HOME"` es la forma **correcta** de escribirlo en bash: citar una variable es lo que evita que
un espacio en la ruta la parta. O sea que el hueco premiaba justamente al que tiene el hábito bueno, y
frenaba al que escribe descuidado.

Y había una asimetría que nadie decidió: `~/` con barra bloqueaba y `$HOME/` no.

## Causa raíz

`engine/hooks/shell.js:123`. El patrón exigía el destino pegado al espacio que sigue a las banderas:
`(?:\/\*?|~\/?|\$HOME|\.\.)`. `destructive` **no desentrecomilla fuera de un commit** —a propósito, para
que `bash -c "…"` y `eval "…"` sigan cayendo—, así que la comilla llega al patrón y lo rompe.

## Fix

El destino se reconoce como lo escribe una persona: `(?:--\s+)?['"]?` delante, y
`\$\{?HOME\}?\/?` para cubrir llaves y barra final. La comilla de cierre ya estaba admitida, porque
`PALABRA` incluye `'` y `"` entre los caracteres que terminan una palabra.

## Tradeoffs

El riesgo es frenar un borrado legítimo, que es trabajo corriente. Se comprobó que no: siguen pasando
`rm -rf ./dist`, `rm -rf node_modules`, `rm -rf /tmp/banco-123`, `rm -rf "$HOME/proyecto/dist"`,
`rm -rf ../otro/dist` y `rm -rf "$PWD/out"` — todos con destino concreto, incluidos los entrecomillados.

## Prioridad

Alta. Es la clase que R23 gobierna y la única cuyo error no se puede revisar después: un borrado mal
apuntado se lleva el trabajo y con él la posibilidad de mirarlo.

## Contexto de descubrimiento

2026-09-16, revisión de código de `engine/`. Un revisor probó el guard con sondas en vez de leerlo, y la
lista de lo que pasaba salió sola.

## Cierre

**Resuelto en 0.95.0.**

- **Las cuatro formas — cubiertas**: comillas simples y dobles, llaves, `--` y barra final.
- **La asimetría `~/` contra `$HOME/` — cerrada**, que era una decisión que nadie había tomado.
- **`bash -c "rm -rf /"` — sigue cayendo**, que es por lo que `destructive` no desentrecomilla y por lo
  que la comilla tuvo que entrar en el patrón en vez de quitarse antes.
- **El frenar de más — comprobado con seis borrados legítimos**, cuatro de ellos con el destino
  entrecomillado, que es donde estaría el riesgo si el patrón se hubiera hecho laxo.

### Qué se corrió

- **Rojo previo** con las cinco formas que pasaban.
- **Las dos direcciones en la misma prueba**: doce que bloquean, seis que pasan.
- **`npm run ci` exit 0**.
