---
caso: 505
titulo: La huella de la firma cubre menos de lo que se aprueba
estado: abierto
prioridad: media
version-detectada: 0.120.0
---

# 505 — La huella de la firma cubre menos de lo que se aprueba

**🔴 abierto** · detectado en 0.120.0, sin publicar · prioridad **media**: la huella del caso 486 todavía no salió, y
ninguna propuesta trackeada la tiene. Corregir ahora no rompe ninguna firma; corregir después sí, porque cambia el hash.

## Resumen

La firma de una propuesta guarda una huella sha256 para que `agent-promote` no aplique lo que cambió después de
aprobar (caso 486). Esa huella cubre menos de lo que la persona aprueba, de dos maneras:

1. **Se corta en el primer `## ` de «Cambio propuesto», aunque esté dentro de un bloque de código.** Un SKILL.md, un
   changelog o cualquier markdown que la propuesta trae entero lleva sus propios títulos. Lo que sigue al primero queda
   fuera de la huella.
2. **No cubre «Evaluación»,** que es donde va el enunciado de un caso nuevo y, desde el caso 501, su fixture. Los dos
   deciden qué se mide y se crean al aplicar.

En los dos casos, alguien con permiso de escritura en la rama puede editar esa parte después de la firma, y
`--check-signature` sale en 0.

## Reproducción

Sobre `agents/roles/system/product-marketing-manager/learning/proposals/2026-11.md` (en `f0fc1adc`), con el
`fingerprint` del motor (`engine/agents/learning-files.js:42`):

```bash
node -e "
const L=require('./engine/agents/learning-files');const fs=require('fs')
const f='agents/roles/system/product-marketing-manager/learning/proposals/2026-11.md'
const lines=fs.readFileSync(f,'utf8').split('\n');const base=L.fingerprint(lines.join('\n'))
const a=[...lines];a[497]+=' EDITADO';const b=[...lines];b[450]+=' EDITADO'
console.log('línea 498:',L.fingerprint(a.join('\n'))!==base,'· línea 451:',L.fingerprint(b.join('\n'))!==base)"
```

Y el `awk` de `sign-proposal.yml:88` sobre el mismo archivo, contra la sección entera:

```bash
awk '/^## Cambio propuesto/ && !d {f=1; d=1; next} /^## /{f=0} f' "$f" | wc -l
awk '/^## Cambio propuesto/{f=1;next} /^## (Riesgos|Evaluación|Aprobación)/{f=0} f' "$f" | wc -l
```

## Síntoma

```
línea 498: false · línea 451: true
103
125
```

Editar la línea 498, que está dentro del changelog de Northlake (el fixture del caso 07, entre las líneas 493 y 514),
no cambia la huella. Editar la 451 sí. El `awk` del workflow firma 103 de las 125 líneas de la sección. Los dos lados
coinciden entre sí, así que hoy nada falla: los dos se quedan cortos.

Hay 8 de las 163 propuestas trackeadas con un `## ` dentro de un bloque de código en «Cambio propuesto»: data-engineer
2026-10, database-administrator 2026-08, procurement-manager 2026-08, product-marketing-manager 2026-11 (tres),
qa-engineer 2026-08, release-manager 2026-08, security-engineer 2026-08 y solutions-engineer 2026-10.

## Causa raíz

- `engine/agents/learning-files.js:42-52`, `fingerprint`: corta en `/^## /` sin mirar los bloques de código, y lee
  sólo «Cambio propuesto».
- `.github/workflows/sign-proposal.yml:88`: el `awk` hace lo mismo, a propósito igual que el motor, para que los dos
  coincidan.

## Fix propuesto

1. La huella cubre «Cambio propuesto» y «Evaluación», cada una hasta el título siguiente **fuera de un bloque de
   código**. «Riesgos y regresiones» queda fuera: no se aplica.
2. El motor y el `awk` cambian juntos, con una prueba que compara sus dos salidas sobre las 163 propuestas trackeadas,
   más una con un `## ` dentro de un bloque. Toca `.github/workflows/`, así que el merge es de quien firma.
3. Mutación: devolver el corte sin mirar los bloques pone roja la propuesta con el bloque; sacar «Evaluación» pone roja
   la que edita el enunciado de un caso nuevo.

**Decisión que pide:** si «Evaluación» entra en la huella. Recomendación: sí. Es lo que crea `agent-promote` además de
«Cambio propuesto», y desde el 501 trae archivos.

## Tradeoffs

- **Cambia la definición del hash.** Una propuesta firmada con la definición actual se leería como editada. Hoy no hay
  ninguna: la línea `Huella:` no aparece en ninguna propuesta trackeada. Por eso conviene antes de publicar 0.120.0.
- **«Evaluación» se edita a veces después de la firma**, para anotar cómo se midió. Si entra en la huella, esa edición
  pide volver a firmar. Hay que mirar en las propuestas aplicadas si pasó, antes de decidir.
- Un bloque de código sin cerrar deja el resto del archivo dentro del bloque, y la huella se extiende hasta el final.
  Es la dirección segura: firma de más.

## Contexto de descubrimiento

Revisión independiente del caso 501, el 2026-11-14. Medido ese día sobre `f0fc1adc`.

## Relacionados

- 486, que introdujo la huella.
- 501, que pone el fixture de un caso nuevo en «Evaluación».
