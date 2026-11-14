---
caso: 506
titulo: La huella de la firma no cubre «Evaluación», donde van el caso nuevo y su fixture
estado: abierto
prioridad: media
version-detectada: 0.120.0
---

# 506 — La huella de la firma no cubre «Evaluación», donde van el caso nuevo y su fixture

**🔴 abierto** · detectado en 0.120.0, sin publicar · prioridad **media**: lo que `agent-promote` crea desde
«Evaluación» se puede editar después de la firma sin que nada lo note. La huella todavía no salió, así que ampliarla
ahora no invalida ninguna firma.

## Resumen

La huella del caso 486 sella sólo «Cambio propuesto». Pero `agent-promote` crea también lo que trae «Evaluación»: el
enunciado de un caso nuevo y, desde el caso 501, su fixture. Los dos deciden qué mide la evaluación del cargo. Editarlos
después de aprobar deja la huella igual, y `agent-promote` crea lo editado.

## Reproducción

Desde la raíz del repositorio, en `f0fc1adc`, sobre la propuesta firmada de backend-engineer de 2026-11, cuya
«Evaluación» trae el enunciado del caso 10:

```bash
f=agents/roles/system/backend-engineer/learning/proposals/2026-11.md
grep -n '^## ' "$f"
node -e "
const L = require('./engine/agents/learning-files')
const text = require('fs').readFileSync('$f', 'utf8')
const edited = text.replace('> El job nocturno que recalcula comisiones', '> El job semanal que recalcula comisiones')
console.log('el enunciado cambió:', edited !== text, '· la huella cambió:', L.fingerprint(edited) !== L.fingerprint(text))"
```

## Síntoma

```
11:## Hallazgos
56:## Evidencia
60:## Cambio propuesto
97:## Riesgos y regresiones
129:## Evaluación
196:## Aprobación humana
el enunciado cambió: true · la huella cambió: false
```

## Causa raíz

- `engine/agents/learning-files.js:42-52`, `fingerprint`: lee sólo «Cambio propuesto».
- `.github/workflows/sign-proposal.yml:88`: el `awk` lee lo mismo.
- `automatization/workflows/agent-promote.js:156-166`: crea el caso y su fixture desde lo que trae la propuesta, donde
  sea que estén.

## Fix propuesto

La huella cubre «Cambio propuesto» y «Evaluación», en ese orden. «Riesgos y regresiones» queda fuera: no se aplica.
Decidido por quien firma el 2026-11-14.

Se construye junto con el 505 y con la misma prueba: el motor y el `awk` comparados sobre las 163 propuestas
trackeadas. Mutación: sacar «Evaluación» de la huella pone roja la propuesta cuyo enunciado se edita.

## Tradeoffs

- **Editar «Evaluación» después de firmar pide volver a firmar.** Medido el 2026-11-14 sobre las 109 propuestas
  firmadas del repositorio: en 3 se editó «Evaluación» entre la firma y la aplicación, todas por quien firma. En dos
  (release-manager y security-engineer 2026-09, commit `7e38e447`) el mismo commit cambió también «Cambio propuesto»,
  así que la huella del 486 ya pedía firmar de nuevo. Sólo en kyc-aml-specialist 2026-10 (`80512216`, una ruta del
  CLI corregida) la firma nueva la causaría este cambio: 1 en 109.
- **Cambia el hash**, igual que el 505. Hoy ninguna propuesta trackeada tiene la línea `Huella:`.

## Contexto de descubrimiento

Revisión independiente del caso 501, el 2026-11-14, al poner el fixture de un caso nuevo en «Evaluación».

## Relacionados

- 486, que introdujo la huella.
- 501, que pone el fixture en «Evaluación».
- 505: la huella se corta dentro de un bloque de código. Se construyen juntos.

## Cierre

La huella cubre «Cambio propuesto» y «Evaluación», con sus títulos, en el orden en que aparecen, la primera de cada una.
«Riesgos y regresiones» queda fuera, porque no se aplica. Lo decidió quien firma el 2026-11-14. Se construyó junto con
el 505, en las mismas funciones y con las mismas pruebas (su cierre tiene el detalle de lo que encontraron las
revisiones).

Línea de base, con la reproducción del caso: editar el enunciado del caso 10 en la propuesta firmada de backend-engineer
dejaba la huella igual. Después: la huella cambió (`true`).

Contra el caso:

- **Fix, la huella cubre «Evaluación»:** se hizo, en el motor y en el `awk`.
- **Fix, la mutación:** sacar «Evaluación» de la huella pone rojas las pruebas, en el motor y en el `awk`.
- **Tradeoff, editar «Evaluación» después de firmar pide volver a firmar:** medido antes de construir, sobre las 109
  propuestas firmadas: sólo una (kyc-aml-specialist 2026-10) habría pedido una firma nueva por esto.
- **Tradeoff, cambia el hash:** ninguna propuesta trackeada tiene la línea `Huella:`.

Lo que el caso no preveía: los textos que decían que la huella cubre sólo «Cambio propuesto» — el mensaje de
`mismatch`, la salida de `--check-signature`, AGENTS.md y la entrada del 486 en el CHANGELOG — dicen ahora las dos
secciones.

### Lista de cierre

1. hecho: la reproducción del caso, antes del cambio (en «Síntoma»).
2. hecho: en la rama de la tanda, `fix/484-re-review-checks-what-it-asked`.
3. hecho: «la huella cubre «Evaluación»» en rojo antes del cambio («editar «Evaluación» pasó») y en verde después.
4. hecho: dos mutaciones, en rojo: sacar «Evaluación» del motor y del `awk`. Las del 505 cubren el resto.
5. hecho: el mensaje de `mismatch`, antes y después, lado a lado: cambia sólo el nombre de las secciones.
6. hecho: el paso real de `sign-proposal.yml`, por `ci-sign.test.js`, con «Evaluación» y un fixture adentro, y la
   reproducción del caso sobre la propuesta real.
7. pendiente: el workflow no corrió en GitHub Actions.
8. hecho: lo mismo que en el 505. El `awk` corrió con `mawk`, no con `gawk`.
9. hecho: el motor y el `awk`, comparados sobre las 163 propuestas trackeadas.
10. hecho: dependen de la huella `learning-seal.js`, `catalog.js` y `agent-promote.js`, y sus textos se corrigieron.
    Nada escribe en «Evaluación» entre la firma y `--check-signature`: `agent-promote` deja sus desvíos en «Aprobación
    humana».
11. hecho: las cuatro pasadas del 505, que revisaron este diff.
12. hecho: la pasada de comentarios del 505.
13. hecho: `npm run ci` con los cambios stageados.
14. hecho: recorrido arriba contra Fix y Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba.
16. pendiente: el estado sigue `abierto` hasta resolver el punto 7. La entrada del 486 en el CHANGELOG ya está ampliada.

**Sin probar:** el workflow en GitHub Actions, y el `awk` con `gawk`.
