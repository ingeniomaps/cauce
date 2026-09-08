---
caso: 054
titulo: `cancel-in-progress` cancela en `main` y el comentario de al lado dice que no
estado: abierto
prioridad: baja
version-detectada: 0.70.0
---

# 054 — El mecanismo que protege a `main` de quedarse sin señal no hace lo que declara

**🔴 abierto** · detectado en 0.70.0 · prioridad **baja** — sin daño observado, pero roto justo para el caso que su comentario nombra

## Resumen

`ci.yml` agrupa las corridas por `ref` y decide cancelar según la rama:

```yaml
concurrency:
  group: ci-${{ github.ref }}
  # Cancelar en `main` dejaba una release sin señal cuando el commit siguiente llegaba antes.
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}
```

En un push a `main` esa expresión debería dar `false`, y el comentario dice para qué: que una release no
se quede sin su propia señal cuando el commit siguiente llega antes de que termine.

**Cancela a veces.** El 2026-09-08 se mergearon los veinte PR de la tanda semanal y quince corridas de
`main` quedaron en `cancelled`. Ese mismo día, dos merges separados por once segundos no cancelaron
ninguna de las dos.

Esa intermitencia es la primera cosa que hay que saber del caso, y por eso está acá arriba: quien lo
tome esperando un fallo determinista va a mergear dos PR seguidos, ver los dos en verde y concluir que
ya no ocurre.

Conviene decir con precisión qué es y qué no es este caso, porque la primera lectura fue más alarmista de
lo que los hechos sostienen. **Acá no hubo daño, y no por suerte**: cada uno de esos veinte cambios es un
archivo de un directorio distinto, su CI ya había pasado en el PR, y una re-corrida de la suite completa
sobre el merge commit era redundante. Cancelarla no perdió información. El caso no es «main se quedó sin
señal»; es que el código no hace lo que su comentario declara, y que el escenario donde eso sí importa
—una release— es exactamente el que el comentario nombra.

## Reproducción

No se reproduce con un comando: hace falta que dos pushes a `main` se solapen. Ocurre solo al mergear
varios PR seguidos, que es como se cierra una tanda semanal.

**Y solaparlos no alcanza.** Dos merges a once segundos de distancia terminaron los dos en verde, así que
una corrida que no cancela no dice nada: no distingue «no ocurre» de «esta vez no tocó». Para afirmar que
dejó de pasar hace falta una tanda del tamaño de la que lo mostró, no un par de merges.

Lo que sí se comprueba después, sobre una tanda ya mergeada:

```bash
set -a; . ./.env; set +a
GH_TOKEN="$GITHUB_PAT_CAUCE" gh api "repos/ingeniomaps/cauce/actions/runs?branch=main&per_page=100" \
  -q '[.workflow_runs[]|select(.name=="CI")]|group_by(.conclusion)|.[]|"\(.[0].conclusion): \(length)"'
```

## Síntoma

```
cancelled: 15
success: 34
```

Las quince canceladas son todas del 2026-09-08 entre las 22:24 y las 22:5x. Antes de esa fecha no hay
ninguna: el repositorio nunca había mergeado tantos PR seguidos, y con merges espaciados las corridas no
se solapan.

Detalle de los primeros siete merges, por commit:

```
73646f7  #262  ci: success
8fe8210  #263  SIN CHECKS      ← cancelada
bd3db46  #264  SIN CHECKS      ← cancelada
470a6f8  #265  SIN CHECKS      ← cancelada
00b98ca  #266  SIN CHECKS      ← cancelada
5397ce5  #267  SIN CHECKS      ← cancelada
ef9cbf3  #268  ci: success
```

Cuando cancela, el patrón es nítido: **cada corrida muere aproximadamente un segundo después de que se
crea la siguiente**, y la última de la tanda sobrevive.

```
d97f8e8  creada 22:34:16  muere 22:34:24   (98b7594 nace 22:34:23)
98b7594  creada 22:34:23  muere 22:34:31   (6049d50 nace 22:34:30)
6049d50  creada 22:34:30  muere 22:34:40   (ec1d75f nace 22:34:39)
ec1d75f  creada 22:34:39  muere 22:34:55   (1219dc6 nace 22:34:54)
1219dc6  creada 22:34:54  termina 22:36:48 — sobrevive
```

**Y el contraejemplo, del mismo día y el mismo repositorio:**

```
499cac0  creada 22:50:43  termina 22:52:04 en verde   (2b69c8c nace 22:50:54)
2b69c8c  creada 22:50:54  termina en verde
```

Once segundos de separación —dentro del rango de siete a dieciséis que sí canceló arriba— y `499cac0`
no se canceló. La diferencia entre las dos tandas no es el intervalo, y no se sabe cuál es.

## Causa raíz

**No encontrada.** La expresión está escrita para no cancelar en `main` y el efecto contradice eso. No se
diagnosticó por qué: puede ser cómo se evalúa `${{ }}` en `concurrency` —que se resuelve antes que el
resto del workflow— o algo del propio `ref` en un push de merge. **No se afirma ninguna de las dos**; lo
verificado es el efecto.

Y el contraejemplo descarta la explicación más cómoda. Si cancelara siempre, bastaría con que la
expresión no se respete; que a veces cancele y a veces no deja eso sin sostén, porque la expresión es la
misma en las dos tandas. Lo que queda en pie es alguna condición de carrera en cómo se aplica el grupo de
concurrencia, y **eso también es hipótesis**: no se comprobó.

El paso siguiente es barato pero hay que dimensionarlo por la intermitencia: un workflow de prueba con el
mismo `concurrency` en un repositorio de descarte, y **una tanda de pushes, no dos**. Con dos, un
resultado en verde no distingue «la expresión se respeta» de «esta vez no tocó», que es exactamente el
error que este caso estuvo a punto de dejar escrito.

## Fix propuesto

Ninguno mientras la causa no esté establecida — un cambio a ciegas sobre una expresión que ya no hace lo
que parece decir es cómo se llega a la segunda versión rota.

Cuando se sepa, hay dos formas y no son equivalentes:

- **Que la expresión funcione**, si resulta que el literal booleano sí se respeta y el problema es otro.
- **Partir el `concurrency` por evento**, dejando el grupo de `main` sin cancelación en vez de calcularla:
  es más largo y no depende de cómo se evalúe una expresión.

## Tradeoffs

- **Arreglarlo cuesta corridas.** La tanda del 2026-09-08 consumió cinco corridas completas de la suite
  —quince canceladas de veinte—; con la cancelación desactivada habrían sido veinte, y quince de ellas no
  pueden encontrar nada que la corrida del PR no haya encontrado ya. El ahorro varía con la
  intermitencia, así que el número es de esa tanda y no un promedio. Verificado: `sourceFiles()`
  (`test/repo/repo.test.js:17-28`) sólo recorre `.js` y `.sh` bajo `engine`, `automatization`, `test` y
  `template`, así que la prueba de razones repetidas no ve los informes; y la de rutas absolutas evalúa
  línea por línea, sin interacción entre archivos. No hay puerta que pueda ponerse roja por la
  combinación de dos informes que pasaron por separado.
- O sea que **la conducta actual es la deseable para esta tanda y la indeseable para una release**, y una
  sola expresión decide las dos. Separarlas por evento es probablemente lo correcto, y es más código.
- Lo que se pierde hoy no es cobertura sino **atribución**: si el último merge se hubiera puesto rojo, no
  habría forma de saber cuál de los veinte lo rompió. Con cambios en directorios disjuntos eso es barato
  de averiguar a mano; con cambios que se tocan, es una tarde de bisect.

## Contexto de descubrimiento

Mergeando los veinte PR de la tanda del 2026-09-07. La pregunta que lo destapó fue por qué algunos merges
«quedaban en cola» — que resultó ser otra cosa, y sin relación: los PR abiertos pasan a `UNKNOWN` mientras
GitHub recalcula su mergeabilidad cada vez que `main` avanza, y vuelven a `CLEAN` solos. Verificado en
vivo sobre los trece que quedaban.

## Relacionados

- Ninguno todavía.
