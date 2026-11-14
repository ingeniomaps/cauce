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
