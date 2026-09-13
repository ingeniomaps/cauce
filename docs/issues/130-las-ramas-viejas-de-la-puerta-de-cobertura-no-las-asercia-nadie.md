---
caso: 130
titulo: La puerta de cobertura tiene seis avisos y sólo dos están aserciados, así que se pueden silenciar los otros cuatro sin que ninguna prueba lo note
estado: abierto
prioridad: media
version-detectada: 0.86.0
---

# 130 — Se puede apagar la mitad de la puerta de cobertura y la suite sigue en verde

**🔴 abierto**

## Resumen

El 129 le puso a `test/tools/coverage-files.js` su primera prueba, y cubrió **lo que ese caso agregaba**:
la distancia contra lo real y la razón escrita. El archivo tiene **seis** avisos de error y la prueba
asercia **dos**. Los cuatro que quedan son los que la puerta venía usando desde siempre:

- un piso que **baja** —la regresión de cobertura, que es la razón de existir del archivo—;
- un archivo del motor **sin piso registrado**, que es lo que evita que un módulo nuevo entre sin una
  sola prueba;
- un piso cuyo archivo **ningún test carga**;
- un piso **huérfano**, de un archivo que ya no existe.

Los cuatro se pueden silenciar y la suite queda en **6 de 6, verde**. Es el mismo defecto que el 129
denuncia —nadie comprueba que lo que cuida la puerta muerda— un nivel más adentro: ahora hay pruebas, y
miran sólo la mitad nueva.

## Reproducción

Sobre una copia desechable del repositorio, hecha con `tar` para que se lleve el `.git` y lo no
trackeado —una hecha con `git ls-files` no corre estas puertas; por qué, en el 129—:

```bash
# Control: la copia arranca verde.
node --test test/repo/coverage-floors.test.js      # ℹ pass 6 / fail 0

# Se rompe el aviso que la puerta usa desde siempre, el de la regresión:
#   errors.push(`${file}: ${metric} bajó de ${needs[metric]}% a ${has[metric]}%`)
# se reemplaza el texto del mensaje por "ROTO".
node --test test/repo/coverage-floors.test.js      # sigue en pass 6 / fail 0
```

Lo mismo con los otros tres, envolviendo cada `errors.push` en `if (false)` o quitando la rama:

```bash
# "sin piso registrado"        → if (false) errors.push(...)
# "ningún test lo carga"       → if (!has) { continue }
# "tiene piso y ya no existe"  → if (false) errors.push(`x`)
```

## Síntoma

Las cuatro mutaciones sobreviven. Medido el 2026-09-13, cada una con su control verde antes y después:

```
=== SANIDAD ===
  ℹ pass 6
  ℹ fail 0

  --- silencio el aviso de piso ausente ---
      ℹ pass 6
      ℹ fail 0
  --- silencio el aviso de piso sin archivo que lo cargue ---
      ℹ pass 6
      ℹ fail 0
  --- silencio el aviso de piso huérfano ---
      ℹ pass 6
      ℹ fail 0
  --- rompo el mensaje de 'bajó de' ---
      ℹ pass 6
      ℹ fail 0
```

## Causa raíz

`test/tools/coverage-files.js:191`, `:194`, `:197` y `:216` — los cuatro `errors.push` que ninguna
aserción nombra. Y la causa de que no se ejerciten no es el olvido de un caso suelto, sino cómo está
armado el arnés que el 129 escribió: el lcov se sintetiza dándole a **cada archivo exactamente su piso**,
tomado del registro real. Con esa forma, por construcción:

- ninguna métrica queda por debajo de su piso, así que la rama de la regresión no corre;
- todo archivo del registro está en el lcov y todo archivo del disco está en el registro, así que las
  tres ramas estructurales tampoco.

O sea que el arnés es determinista y barato —que es lo que se buscaba— y **su punto de partida es el
estado en que las cuatro ramas viejas son inalcanzables**. Cubrirlas no pide otro arnés: pide mover el
registro o el lcov, que es lo que `corrida(cambiar)` ya sabe hacer.

## Fix propuesto

Cuatro casos más en `test/repo/coverage-floors.test.js`, usando el helper que ya existe:

1. **Bajar una métrica por debajo de su piso menos `SLACK`** y aserciar `bajó de X% a Y%` con su archivo.
   Conviene además el borde: exactamente `piso - SLACK` **pasa**, que es lo que fija para qué está la
   holgura y evita que alguien la cambie sin verlo.
2. **Sacar la entrada de un archivo del registro** y aserciar `sin piso registrado`.
3. **Dejar un piso cuyo archivo no esté en el lcov** y aserciar `tiene piso pero ningún test lo carga`.
4. **Agregar un piso de un archivo que no existe en el disco** y aserciar `tiene piso y ya no existe`.

Cada uno con su mutación, que es lo que este caso mostró que faltaba: la aserción que nunca se vio en
rojo no prueba que mire lo que dice mirar.

## Tradeoffs

- **Es barato**: el arnés ya está y son cuatro casos declarativos. Lo que cuesta es acordarse de que la
  prueba de un cambio no cubre lo que el archivo ya hacía.
- **El arnés sintético puede divergir del lcov real.** Hoy arma los registros a mano —`LF:100`,
  `LH:<piso>`— y si el formato que emite Node cambiara, la prueba seguiría verde sobre una forma que ya
  no existe. No es este caso, y conviene anotarlo: la única defensa hoy es que `coverage` corre de
  verdad en `ci` dos pasos más adelante.
- **No cambia la conducta del producto**: ningún usuario ve nada. Es la puerta cuidándose a sí misma.

## Prioridad

**Media.** No pierde trabajo y no rompe nada hoy: lo que hace es que la puerta que vigila 67 archivos
del motor se pueda desarmar sin que la suite lo note. Sube a alta el día que alguien toque
`coverage-files.js` por otra razón y se lleve puesta una de esas cuatro ramas sin enterarse — que es
exactamente cómo el 129 llegó a existir.

## Contexto de descubrimiento

Salió al revisar qué quedaba abierto **después** de cerrar el 129, contando cuántas ramas de error tiene
el archivo contra cuántas nombra la prueba: seis contra dos. No se dio por buena esa cuenta: se mutaron
las cuatro y las cuatro sobrevivieron.

Vale la pena decir cómo se cerró el 129, porque es la lección: ahí las seis aserciones **sí** se vieron
en rojo, cinco por mutación y dos por el rojo previo. La disciplina se aplicó a lo que el caso agregaba
y no a lo que el archivo ya tenía, y nadie lo iba a notar — el diff se lee completo y la suite pasa.

## Relacionados

- **129** — el caso que puso la primera prueba de este archivo y que dejó estas cuatro ramas afuera.
- **131** — `dead-code.js`, la otra herramienta de `ci`, que no tiene ninguna prueba.
- **132** — `hooks-smoke.sh`, cuya primera comprobación pasa en verde si el guard no llega a correr.
