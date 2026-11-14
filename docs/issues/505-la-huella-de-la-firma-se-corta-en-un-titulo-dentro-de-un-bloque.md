---
caso: 505
titulo: La huella de la firma se corta en un título que está dentro de un bloque de código
estado: resuelto
resuelto-en: 0.120.0
prioridad: media
version-detectada: 0.120.0
---

# 505 — La huella de la firma se corta en un título que está dentro de un bloque de código

**🟢 resuelto en 0.120.0** · detectado en 0.120.0, sin publicar · prioridad **media**: deja sin firmar parte de lo que se aprobó
en 8 de las 163 propuestas trackeadas. La huella todavía no salió y ninguna propuesta trackeada la tiene, así que
corregirla ahora no invalida ninguna firma. Sube a alta si sale publicada sin corregir: desde ahí, cambiarla invalida
las firmas que ya la tengan.

## Resumen

La firma de una propuesta guarda una huella sha256 de «Cambio propuesto», para que `agent-promote` no aplique lo que
cambió después de aprobar (caso 486). La huella termina en la primera línea que empieza con `## `, aunque esa línea
esté dentro de un bloque de código. Una propuesta que trae entero un markdown con sus propios títulos, como un
changelog o un SKILL.md, deja fuera de la huella todo lo que sigue al primero de esos títulos. Se puede editar después
de la firma y `--check-signature` sale en 0.

## Reproducción

Desde la raíz del repositorio, en `f0fc1adc`, con el `fingerprint` del motor y el `awk` del workflow:

```bash
f=agents/roles/system/product-marketing-manager/learning/proposals/2026-11.md
node -e "
const L = require('./engine/agents/learning-files')
const lines = require('fs').readFileSync('$f', 'utf8').split('\n')
const base = L.fingerprint(lines.join('\n'))
const edit = (n) => { const copy = [...lines]; copy[n - 1] += ' EDITADO'; return L.fingerprint(copy.join('\n')) !== base }
console.log('editar la 451 cambia la huella:', edit(451), '· editar la 498:', edit(498))"
awk '/^## Cambio propuesto/ && !d {f=1; d=1; next} /^## /{f=0} f' "$f" | wc -l
awk '/^## Cambio propuesto/{f=1; next} /^## (Riesgos|Evaluación|Aprobación)/{f=0} f' "$f" | wc -l
```

Y cuántas propuestas trackeadas tienen un `## ` dentro de un bloque de código en «Cambio propuesto»:

```bash
for p in $(git ls-files 'agents/roles/*/learning/proposals/*.md' 'flows/*/learning/proposals/*.md'); do
  awk '/^## Cambio propuesto/{f=1; next} f && /^```/{b=!b} f && !b && /^## /{exit} f && b && /^## /{n++} END{if (n) print FILENAME}' "$p"
done | wc -l
git ls-files 'agents/roles/*/learning/proposals/*.md' 'flows/*/learning/proposals/*.md' | wc -l
```

## Síntoma

```
editar la 451 cambia la huella: true · editar la 498: false
103
125
8
163
```

La línea 498 está dentro del changelog de Northlake, el fixture del caso 07, que la propuesta trae entero en un bloque
entre las líneas 486 y 504. El `awk` del workflow firma 103 de las 125 líneas de la sección. El motor y el workflow
cortan en el mismo lugar, así que hoy nada falla: los dos se quedan cortos.

Las 8 propuestas: data-engineer 2026-10, database-administrator 2026-08, procurement-manager 2026-08,
product-marketing-manager 2026-11, qa-engineer 2026-08, release-manager 2026-08, security-engineer 2026-08 y
solutions-engineer 2026-10.

## Causa raíz

- `engine/agents/learning-files.js:42-52`, `fingerprint`: corta en `/^## /` sin mirar si la línea está dentro de un
  bloque de código.
- `.github/workflows/sign-proposal.yml:88`: el `awk` hace lo mismo. Los dos tienen que coincidir, o toda propuesta
  firmada se lee como editada.

## Fix propuesto

1. El motor y el `awk` llevan la cuenta de los bloques de código (líneas que empiezan con ```` ``` ````) y sólo cortan
   en un `## ` que esté fuera de uno.
2. Una prueba que compara las huellas del motor y del `awk` sobre las 163 propuestas trackeadas, más una con un `## `
   dentro de un bloque. Toca `.github/workflows/`, así que el merge es de quien firma.
3. Mutación: volver a cortar sin mirar los bloques pone roja la propuesta con el bloque.

## Tradeoffs

- **Cambia el hash.** Una propuesta firmada con la definición actual se leería como editada. Hoy no hay ninguna: la
  línea `Huella:` no aparece en ninguna propuesta trackeada.
- **Un bloque sin cerrar es el borde peligroso, y en los dos sentidos.** Dentro de las secciones firmadas, deja
  «Aprobación humana» adentro de la huella, y esa sección la reescribe la firma después de calcularla: la propuesta
  recién firmada no coincide nunca. Antes de «Cambio propuesto», deja la sección dentro del bloque y la huella vacía,
  que acepta cualquier edición. Por eso «Aprobación humana» termina la huella siempre, y el workflow no firma si no
  encuentra ninguna sección fuera de un bloque. Hoy ninguna de las 163 propuestas trackeadas tiene un bloque sin
  cerrar.
- Se cuentan sólo los bloques que abren con ```` ``` ```` al principio de la línea. Un bloque con `~~~`, uno con
  sangría y uno de cuatro backticks que trae tres adentro no se cuentan bien, y un `## ` dentro de ellos corta la
  sección. Un «Aprobación humana» dentro de un fixture la corta antes de tiempo. Ninguna propuesta trackeada trae esas
  formas.

## Contexto de descubrimiento

Revisión independiente del caso 501, el 2026-11-14: el fixture de un caso nuevo trae su markdown entero, y a veces
con títulos. Medido ese día.

## Relacionados

- 486, que introdujo la huella.
- 506: lo que la huella no cubre por diseño, «Evaluación». Se construyen juntos porque los dos cambian el hash, y
  conviene cambiarlo una sola vez.

## Cierre

La huella termina una sección sólo en un `## ` que esté fuera de un bloque de código, en el motor (`fingerprint`,
`engine/agents/learning-files.js`) y en el `awk` de `sign-proposal.yml`, que siguen calculando lo mismo. Y como un bloque
sin cerrar corre todos los cortes, el workflow no firma una propuesta que tenga uno antes de «Aprobación humana»: falla
con «tiene un bloque de código sin cerrar antes de «Aprobación humana»», y la propuesta queda pendiente.

Línea de base, con la reproducción del caso: editar la línea 498, dentro del changelog de Northlake, dejaba la huella
igual, y el `awk` firmaba 103 de las 125 líneas de la sección. Después: editar la 498 cambia la huella, y el `awk` firma la
sección entera.

Contra el caso:

- **Fix 1, contar los bloques en el motor y en el `awk`:** se hizo.
- **Fix 2, la prueba que compara las dos huellas sobre las 163 propuestas y una con un bloque:** se hizo, en
  `test/agents/learning-signature.test.js`, con los bordes de la revisión: bloque sin cerrar, título falso dentro de un
  bloque antes de la sección, secciones repetidas y CRLF. Toca `.github/workflows/`, así que el merge es de quien firma.
- **Fix 3, la mutación:** cortar sin mirar los bloques pone rojas las pruebas, en el motor y en el `awk`.
- **Tradeoff, cambia el hash:** hoy ninguna propuesta trackeada tiene la línea `Huella:`, así que no se invalida ninguna
  firma. Sale en 0.120.0 junto con la huella.
- **Tradeoff, el bloque sin cerrar:** el caso decía que firmaba de más y que era la dirección segura. Era falso, y lo
  encontró la revisión independiente. Dentro de las secciones firmadas, el bloque dejaba «Aprobación humana» adentro
  de la huella; la firma la reescribe después de calcularla, así que la propuesta recién firmada no coincidía nunca.
  Antes de «Cambio propuesto», dejaba la huella vacía, que acepta cualquier edición. Ahora «Aprobación humana» termina la
  huella siempre, y un bloque sin cerrar no se firma. El Tradeoff del caso quedó corregido.
- **Tradeoff, `~~~` y otras formas:** declaradas en el caso. Un bloque con `~~~`, uno con sangría y uno de cuatro
  backticks que trae tres adentro no se cuentan bien. Ninguna de las 163 propuestas trackeadas usa esas formas.

Lo que el caso no preveía:

- **El `sed` de la firma reescribía su línea en todo el archivo**, también dentro de lo firmado. Un fixture con
  `- Estado: pendiente` quedaba alterado y la propuesta no coincidía. Ahora el `sed` sólo toca «Aprobación humana», y la
  detección de pendientes también: con la detección vieja, una segunda aprobación del PR volvía a tomar como pendiente
  la propuesta ya firmada y el job terminaba en rojo, sin nada que commitear.
- **El motor lee `- Estado:` en todo el archivo**, al sellar, al archivar y al contar firmadas. Ya pasaba antes y no lo
  empeora este cambio. Sale como el caso 507.
- **Una propuesta sin «Cambio propuesto» se firmaba con la huella vacía.** Ahora no se firma. La fixture de
  `ci-sign.test.js` era una propuesta así, y lleva la sección como los tres moldes del motor.

### Lista de cierre

1. hecho: la reproducción del caso, antes del cambio (en «Síntoma»).
2. hecho: en la rama de la tanda, `fix/484-re-review-checks-what-it-asked`.
3. hecho: la prueba de bloques en rojo antes del cambio y en verde después. La del bloque sin cerrar en el orden de
   producción («recién firmada, ya se lee como editada») se vio en rojo con la primera versión del arreglo.
4. hecho: once mutaciones, todas en rojo: cortar sin contar bloques, en el motor y en el `awk`; quitar el corte en
   «Aprobación humana» en los dos; quitar `END{exit b}`; quitar la negativa a firmar vacío; no acotar el `sed`; y no
   acotar la detección de pendientes. La de
   la firma vacía sobrevivió hasta que se sumó una propuesta sin «Cambio propuesto» y sin bloques.
5. hecho: una quita, firmar sin «Cambio propuesto», tiene su aserción de ausencia, en rojo con la quita devuelta. Y la
   salida de antes y la de después del caso, lado a lado, arriba.
6. hecho: el paso real de `sign-proposal.yml`, ejecutado por `ci-sign.test.js` con su `awk` y su `sed`, sobre un
   repositorio git con la propuesta aprobada, y la reproducción del caso sobre la propuesta real.
7. hecho: el workflow corrió en GitHub Actions el 2026-11-14, con una aprobación real sobre el PR de prueba #993, que
   traía una propuesta pendiente de `backend-engineer` con un título `## ` dentro de un bloque en «Cambio propuesto» y
   un fixture con `- Estado: pendiente` en «Evaluación». La corrida `43645796297` (`pull_request_review`, 22:00:47)
   corrió después de mergear el #992, así que usó el workflow nuevo. Firmó en `7aa94ace` con la huella
   `f2fd55a8045f…`. Con el `awk` del 486 habría sido `6cca2815be22…`. Medido sobre la propuesta firmada:
   - la huella es la que calcula el motor;
   - editar dentro del bloque y editar «Evaluación» la cambian;
   - el fixture conserva su `- Estado: pendiente`, porque la firma escribe sólo en «Aprobación humana»;
   - `ops learn backend-engineer --check-signature` acepta la firmada (exit 0) y rechaza la de «Evaluación» editada
     (exit 1, «cambió después de la firma»).

   El `awk` que corrió es el del runner de GitHub, con el mismo resultado que el motor.
8. hecho: corrieron el paso del workflow, el motor, la comparación sobre las 163 propuestas y el CLI de
   `--check-signature`. El `awk` corrió con `mawk`, el de esta máquina. Con `gawk`, que puede ser el del runner, no.
9. hecho: dos implementaciones de la misma huella, el motor y el `awk`, comparadas en cada prueba.
10. hecho: dependen de la huella `learning-seal.js` (sellar y `mismatch`), `catalog.js` (`--check-signature`) y
    `agent-promote.js`. Sus textos, AGENTS.md, el CHANGELOG del 486 y los títulos de las pruebas decían que la huella
    cubre sólo «Cambio propuesto», y se corrigieron. `adoption.js` usa otra huella, sin relación.
11. hecho: cuatro pasadas independientes. La primera encontró las dos regresiones del bloque sin cerrar (impedían
    entregar). La segunda, tres líneas largas (impedían entregar), el bloque en «Riesgos» y el `sed`, arreglados. La
    tercera, que acotar el `sed` dejaba la detección de pendientes sin acotar, arreglado. La cuarta, nada que impidiera
    entregar; anotó el borde de una tubería con `pipefail`, que el paso no usa, y lo del motor, que es el caso 507.
12. hecho: pasada uno por uno sobre los comentarios del motor, del workflow y de las pruebas.
13. hecho: `npm run ci` con los cambios stageados.
14. hecho: recorrido arriba contra Fix y Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba.
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.120.0`, y la entrada del 486 en el CHANGELOG ampliada.

**Sin probar:** una propuesta mensual real del ciclo, que la ejercita el ensamblaje del 1 de diciembre.
