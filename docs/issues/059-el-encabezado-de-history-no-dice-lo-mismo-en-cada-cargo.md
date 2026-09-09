---
caso: 059
titulo: El encabezado de `HISTORY.md` dice trece cosas distintas, y nueve contradicen a su propia tabla
estado: resuelto
resuelto-en: 0.71.0
prioridad: baja
version-detectada: 0.71.0
---

# 059 — Cada cargo declara un contrato distinto para el mismo archivo

**🟢 resuelto en 0.71.0** · detectado en 0.71.0 · prioridad **baja** — nada falla; lo que se rompe es poder decir qué va en ese archivo

## Resumen

`learning/HISTORY.md` es el mismo artefacto en los 53 cargos y su encabezado no dice lo mismo en ninguno
de dos. Hay **trece redacciones distintas** para la línea que declara qué se registra ahí, y la tabla que
va debajo sí es uniforme en 29 de ellos: `| Fecha | Propuesta | Decisión | Aprobó | Cambio aplicado |`.

**Nueve de esos encabezados contradicen a su propia tabla.** Dicen alguna variante de «registrar
únicamente cambios aprobados y aplicados», mientras la columna se llama «Decisión» —no «Aplicada»— y
existe justamente porque hay más de una. Desde 0.71.0 hay dos: aplicar y archivar.

No rompe nada hoy. Lo que rompe es la pregunta «¿qué va en este archivo?», que se contesta distinto según
el cargo que uno abra, y ninguna de las respuestas manda sobre las otras.

## Reproducción

```bash
git clone https://github.com/ingeniomaps/cauce && cd cauce

# Las trece redacciones y cuántos cargos usa cada una:
for f in agents/roles/system/*/learning/HISTORY.md; do sed -n '3p' "$f"; done | sort | uniq -c | sort -rn

# Los que dicen «únicamente aprobados» y llevan debajo una columna «Decisión»:
grep -l "únicamente cambios aprobados" agents/roles/system/*/learning/HISTORY.md | wc -l
```

## Síntoma

```
     29 | Fecha | Propuesta | Decisión | Aprobó | Cambio aplicado |
      6 Registrar fecha, propuesta, fuentes/versiones, evidencia, decisión humana, cambios, evaluaciones y responsable.
      4 Registrar únicamente cambios aprobados, con fecha, evidencia, evaluación y responsable.
      4 Registrar fecha, propuesta, fuentes/versiones, decisión humana, cambios aplicados, evaluaciones y responsable.
      1 Registrar únicamente cambios aprobados y aplicados al agente.
      …
```

Nueve de 53 contradicen a la tabla que tienen debajo.

## Causa raíz

No hay una: **nadie generó estos archivos desde un molde**. `learning/HISTORY.md` no lo crea ningún
comando —`appendHistory` (`engine/agents/learning-seal.js`) se niega si el archivo no existe— así que cada
uno se escribió a mano en el momento en que su cargo entró al catálogo, y la redacción salió distinta cada
vez.

## Fix propuesto

Una redacción sola, derivada de la tabla en vez de escrita aparte. Y como el archivo no lo crea nadie,
convendría que lo cree el mismo comando que lo escribe: hoy un cargo sin `HISTORY.md` pierde sus filas en
silencio, que es un defecto aparte de la redacción.

**No se propone el texto acá.** Elegirlo es decidir qué se registra —sólo lo aplicado, o toda decisión que
saca una propuesta del ciclo—, y esa decisión es del mantenedor.

## Tradeoffs

- `learning/HISTORY.md` **viaja en el paquete**, así que reescribir 53 encabezados baja a cada consumidor
  en su próximo `upgrade`. Es un cambio visible aunque no toque código.
- Unificar la redacción borra las variantes que decían algo propio del cargo —dos nombran jurisdicción y
  país, que son de `kyc-aml-specialist` y `legal-counsel`—. Si esas diferencias son deliberadas, la
  unificación las pierde y hay que decidir eso antes.
- **No medido**: nadie reportó haberse confundido por esto. Es un defecto encontrado mirando, no uno que
  haya costado algo todavía.

## Contexto de descubrimiento

Cerrando el caso [053](053-una-propuesta-se-archiva-sin-que-quede-la-decision.md). Ese caso anticipaba
que registrar una propuesta archivada obligaría a reescribir el encabezado de `HISTORY.md`, y al mirarlo
resultó que la tabla ya lo admitía —la columna se llama «Decisión»— y que el problema era otro: los
encabezados no coinciden entre sí ni con su tabla.

## Relacionados

- [053](053-una-propuesta-se-archiva-sin-que-quede-la-decision.md) — de donde sale. Allá se agregó la
  segunda decisión que la tabla ya preveía; acá queda que nueve encabezados digan que no existe.

## Cierre

**Resuelto en 0.71.0.** El recorrido de lo que enumeró:

- **Una sola redacción para los 53, derivada de la tabla**, como pedía el fix: «una fila por propuesta
  cerrada: cuándo, cuál, qué se decidió —aplicarla o archivarla—, quién lo decidió y qué cambió». Nombra
  las dos decisiones que la columna admite, que es lo que nueve encabezados contradecían.
- **El texto lo eligió el mantenedor, que era la decisión que este caso no tomaba.**
- **Tradeoff «unificar borra las variantes propias» — se evitó, y comprobando primero si valía la pena.**
  Las tres —país en `kyc-aml-specialist`, jurisdicción en `legal-counsel`, revisión de Legal en
  `ai-governance-lead`— resultaron **letra muerta**: los dos últimos tienen **cero filas**, y la única de
  `kyc-aml` no registra el país que su encabezado pedía. Ninguna tiene columna donde ponerlo. Aun así no
  se borraron: quedan como línea aparte, porque dos son de cargos regulatorios y borrar un requisito que
  no se cumple no es lo mismo que arreglar una redacción.
- **Tradeoff «`HISTORY.md` viaja en el paquete» — se paga.** Los 53 bajan a cada consumidor en su próximo
  `upgrade`. Es cambio visible sin tocar código.
- **Tradeoff «no medido: nadie reportó confundirse» — sigue sin medirse, y no cambió la decisión**, porque
  lo que la sostiene no es la confusión de alguien sino que nueve archivos decían lo contrario de su
  propia tabla.
- **La segunda mitad del fix —«que lo cree el mismo comando que lo escribe»— se hizo distinto y por una
  razón que el caso no tenía.** No era que el archivo faltara: **dieciséis de los 53 lo tenían sin tabla**,
  sólo con su párrafo, y `appendHistory` pegaba la fila ahí. En markdown eso no es una tabla sino texto
  con barras. Ahora la cabecera se agrega antes de la primera fila, una sola vez.

**Probado con el comando real** sobre una instancia creada con `init`, antes y después: antes la fila
quedaba pegada al párrafo; después entra bajo su cabecera, y un segundo archivado no la repite —una
cabecera, dos filas—. Tres mutaciones comprobadas: no agregar la cabecera, agregarla siempre, y hacer
divergir un encabezado.

Lo que el caso no preveía y apareció al medirlo: **el problema no eran trece redacciones sino dieciséis
archivos rotos.** El enunciado contaba las variantes de texto, que es lo que se ve leyendo; lo que sólo se
ve corriendo es que en casi un tercio del catálogo la fila no entraba en ninguna tabla.
