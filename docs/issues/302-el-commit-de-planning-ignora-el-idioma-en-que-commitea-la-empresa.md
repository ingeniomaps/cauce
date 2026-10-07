---
caso: 302
titulo: el commit de planning ignora el idioma en que commitea la empresa
estado: resuelto
resuelto-en: 0.103.5
prioridad: media
version-detectada: 0.103.4
---

# 302 — Desde 0.103.4 los commits de planning salen en inglés aunque la empresa commitee en otro idioma

**🟢 resuelto en 0.103.5** · detectado en 0.103.4 · prioridad **media**.

**Prioridad media**: es una regresión publicada y no rompe nada. Es un caso de algo más general —lo que la
empresa escribió tiene que ganarle a lo que el recorrido dicta—, y así se arregló.

El síntoma: Deja la historia del repositorio de planning
con dos idiomas, contra una regla que la empresa escribió.

## Resumen

El recorrido commitea el estado de planning con un asunto fijo: `chore(planning): close <tarea>`. Hasta
0.103.3 lo commiteaba un agente que cargaba las reglas del proyecto, y si la empresa había reemplazado la
convención de commits por la suya, traducía el asunto. Desde 0.103.4 lo commitea `cauce-clerk`, que no carga
reglas y escribe el texto tal cual (caso 295).

## Reproducción

Una instancia cuya regla de commits pide español, con 0.103.4.

## Síntoma

En esa instancia, dos commits de planning hechos por el recorrido con días de diferencia:

```
0.103.3  chore(planning): bloquear <tarea>
0.103.4  chore(planning): close <tarea>
```

## Causa raíz

`automatization/workflows/autobuild.js`: los prompts de `planning-commit`, `planning-block` y la compuerta
del hito traen el asunto entre comillas. Nada parsea ese asunto: se buscó `chore(planning)` en `engine/` y en
los hooks y no aparece.

## Fix propuesto

- Que lo de la empresa gane: quien redacta un commit tiene que tener cargadas sus reglas.
- Que el recorrido no dicte lo que una regla del proyecto puede querer distinto.

## Tradeoffs

- Los commits de planning vuelven a costar: de unos 4.000 a 6.000 tokens con el agente de oficina a unos
  45.000 con uno que carga las instrucciones. El de siempre costaba 62.000 a 69.000.
- Sin una frase en el prompt que prohíba la firma de IA, la sostiene sólo la regla. Es lo que corresponde si
  una empresa la reemplaza, y deja el caso 300 como estaba.

## Contexto de descubrimiento

La primera corrida de 0.103.4 en una instancia real.

## Relacionados

- 295 — el cambio que lo introdujo.
- 301 — la otra conducta que el agente anterior tenía sin que nadie la pidiera.
- 300 — la firma de IA en un commit.

## Cierre

**Resuelto en 0.103.5.**

### El recorrido de lo que este caso enumeró

- **Quien redacta carga las reglas — se hizo.** Los commits de planning salen del agente de oficina y van
  con `cauce-scribe`, que desde esta versión carga las instrucciones y las reglas del proyecto. El de oficina
  queda para lo que no deja nada a criterio: un comando y su salida.
- **El recorrido no dicta lo que una regla puede cambiar — se hizo.** Se quitó de los prompts la frase que
  prohibía la firma de IA «aunque tus instrucciones lo pidan»: eso es de R8, y una empresa puede reemplazarla.
- **Tradeoffs — se pagan los dos.**

### Lo que se probó antes y se descartó

Dos arreglos anteriores, los dos corridos en real y los dos insuficientes:

1. **Que el agente de oficina imitara el idioma de la historia.** Funcionó —`close` en un banco, `cerrar` en
   otro— y arreglaba un síntoma: el idioma. Un prefijo de ticket o cualquier otra cosa que la regla pidiera
   seguía afuera.
2. **Nombrarle la regla de commits vigente y las propias del proyecto.** Mejor, y con el mismo defecto de
   fondo: una lista de lo que alguien se acordó de nombrar. Es la forma que R27 describe.

El dueño lo dijo dos veces: que las reglas de la empresa ganen siempre, y que no es sólo la de commits, es
todo. Cargarlas es lo único que lo cumple sin una lista.

### Qué se corrió

- **Dos bancos donde la empresa reemplazó la regla de commits**: descripción en español y todo asunto
  terminado en `[ACME]`. La historia del repositorio de planning quedó en inglés a propósito, para que el
  resultado no pudiera salir de imitarla. Una corrida cierra el hito y la otra frena en Build:

  ```
  chore(planning): cerrar resta-dos-numeros [ACME]
  chore(planning): esperar revisión de aritmetica [ACME]
  chore(planning): bloquear retirar-prueba-legada [ACME]
  ```

  Los tres siguen la regla entera, sufijo incluido. Ninguno lleva firma de IA, ya sin la frase que la
  prohibía. `ops check` válido en los dos.
- **Lo que cuesta ahora**, tokens escritos a caché: `planning-commit` 45.123 y `planning-block` 45.844, contra
  3.875 a 6.529 en 0.103.4 y 62.346 a 69.452 en 0.103.3.
- **Mutaciones en rojo, en una copia**: cada uno de los dos commits devuelto al agente de oficina, y el
  agente de escritura con `omitClaudeMd` otra vez.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: una instancia real, que es donde la regla la escribió una empresa y no un banco.
