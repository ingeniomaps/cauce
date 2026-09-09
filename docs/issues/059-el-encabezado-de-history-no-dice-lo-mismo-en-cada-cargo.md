---
caso: 059
titulo: El encabezado de `HISTORY.md` dice trece cosas distintas, y nueve contradicen a su propia tabla
estado: abierto
prioridad: baja
version-detectada: 0.71.0
---

# 059 — Cada cargo declara un contrato distinto para el mismo archivo

**🔴 abierto** · detectado en 0.71.0 · prioridad **baja** — nada falla; lo que se rompe es poder decir qué va en ese archivo

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
