---
caso: 164
titulo: Redirigir con `>|` evade el guard que mira a dónde escribe un comando, y por ahí se escribe la propia aprobación
estado: resuelto
resuelto-en: 0.95.0
prioridad: alta
version-detectada: 0.94.0
---

# 164 — `>|` evade el guard de escrituras

**🟢 resuelto en 0.95.0** · detectado en 0.94.0 · prioridad **alta** — el destino de la escritura no lo
veía nadie, y una de las cosas que se escriben por ahí es la aprobación que habilita el push

## Resumen

`>|` es el override de `noclobber`: escribe en el destino aunque el shell esté configurado para no
pisarlo. Escribe exactamente igual que `>`, y el guard que mira a dónde escribe un comando no lo veía.

## Reproducción

Sobre un banco `suelto`, contra el guard real:

```
BLOQUEA  ← echo x > <fuera-de-la-raíz>
BLOQUEA  ← echo x >> <fuera-de-la-raíz>
PASA     ← echo x >| <fuera-de-la-raíz>
```

## Causa raíz

No estaba donde parecía. `REDIRECT` (`engine/hooks/shell.js:260`) tampoco reconocía el `|`, pero
arreglarlo **no alcanzó**: el defecto es anterior. `writesWithBase` (`shell.js:320`) parte el comando en
segmentos con `split(/[;&|\n]+/)` **antes** de buscar destinos, así que `echo x >| ruta` llegaba ya roto
en dos —`echo x >` y ` ruta`— y la redirección quedaba separada de su destino.

O sea que el `|` de `>|` se estaba leyendo como tubería, que es lo único que ese carácter no es ahí.

## Fix

Dos mitades, y la segunda es la que cierra:

- El split deja de partir en un `|` precedido por `>`: `split(/[;&\n]+|(?<!>)\|+/)`.
- `REDIRECT` admite el override: `&?\d*>>?\|?\s*…`.

## Alcance de lo que se arregló, medido y no supuesto

`writesWithBase` alimenta **dos** guards registrados —`shell-boundary` y `ops-config-shell`—, no tres. Lo
que se comprobó corriendo es `shell-boundary`: las tres formas de redirigir ahora contestan igual.

Sobre `ops-config-shell` el destino ahora también se ve, pero **no se demostró un cambio de conducta**: su
condición de bloqueo pide más contexto del que la sonda montó —ni con la llave protegida adentro llegó a
frenar en el banco—, así que afirmarlo sería afirmar de más.

## Tradeoffs

El riesgo del arreglo es frenar de más: si el split dejara de partir en cualquier `|`, una tubería
corriente pasaría a leerse como destino. Se comprobó que no: `ls | wc -l` y `a || b` siguen sin producir
ningún destino, y `cat f | tee /tmp/x` sigue produciendo el suyo.

## Prioridad

Alta. No es una curiosidad de parseo: lo que se escribe por ese hueco es `planning/.ops-approval`, la
aprobación que después habilita el push a la rama viva. Es lo que cerraron el 098 y el 119, reabierto por
una barra.

## Contexto de descubrimiento

2026-09-16, en una revisión de código de `engine/` entera, pedida como barrido de buenas prácticas y no
como caza de defectos. Lo encontró un revisor probando los guards con sondas contra el código real en vez
de leerlos; la lectura sola no lo mostraba, porque el regex de `REDIRECT` se ve razonable y el problema
estaba dos funciones más arriba.

## Relacionados

- **098** y **119** — el agente no se firma su propia aprobación; esto reabría esa puerta.
- **028** y **067** — los otros dos huecos del léxico de shell: dónde empieza una palabra y dónde termina
  un comando. Éste es el tercero de la misma familia.

## Cierre

**Resuelto en 0.95.0.**

- **La reproducción — hecha, con la salida pegada arriba**, contra el guard real sobre un banco.
- **La causa raíz — se hizo distinta a la que el hallazgo decía.** El primer arreglo fue a `REDIRECT` y no
  cambió nada: la prueba siguió en rojo. El defecto estaba en el split de `writesWithBase`, dos funciones
  antes. Quedó registrado arriba porque es lo que un lector del futuro va a suponer mal.
- **El alcance — acotado a lo medido.** El hallazgo original decía tres guards; son dos, y de ésos sólo se
  demostró el cambio de conducta en uno. Dicho en «Alcance», no escondido.
- **El frenar de más — comprobado**, con las tres formas que no deben producir destino.

### Qué se corrió

- **Rojo previo**: la prueba nueva de `test/hooks/boundaries.test.js` falla contra el árbol sin el
  arreglo, y siguió fallando con el arreglo a medias —sólo `REDIRECT`—, que es lo que mostró que la causa
  era otra.
- **Las dos mitades de la prueba**: que `>`, `>>` y `>|` bloqueen igual fuera de la raíz, y que `>|`
  adentro de la raíz siga pasando. Sin la segunda, «bloquea `>|`» se cumple bloqueando todo.
- **Verificación de punta a punta** sobre el banco: las tres formas bloquean.
- **`npm run ci` exit 0**, 882 pruebas, 0 fallos.
