---
caso: 534
titulo: una entrada de done/ que describe la verificación sin pegar un exit code ni un conteo pasa `check`
estado: resuelto
resuelto-en: 0.124.0
prioridad: media
version-detectada: 0.123.1
---

# 534 — una entrada de done/ que describe la verificación sin pegar un exit code ni un conteo pasa `check`

**🟢 resuelto en 0.124.0** · detectado en 0.123.1 · prioridad **media**: el PROTOCOL lo exige y nada lo comprueba, que es la forma
de regla «presentada como más fuerte de lo que es» que R10 dice que enseña a no creerle al resto. Medido en cuatro
instancias reales, entre el 8 % y el 69 % de las entradas no pegan ningún resultado.

## Resumen

`PROTOCOL.md:92` pide «registrar exit codes» en Verify, y `:175` dice «No declarar éxito sin comandos, resultados y exit
codes reales — BR-OPS-004». La plantilla de `done/` llena `done:` con «cambios y comandos de verificación con exit
codes». Pero `check` valida `tests:`, `commit:` y `decisions:`, y no lee `done:` ni `qa:`: una entrada que dice
«verifiqué que las pruebas pasan; todo en verde» pasa igual que una que pega `npm test → exit 0, 41 passed`.

## Reproducción

```bash
BANCO=$(node engine/cli/ops.js bench suelto) && cd "$BANCO"
cat > planning/done/alta-de-cliente.md <<'EOF'
- [x] **alta-de-cliente** — Alta de cliente
  acept: el alta rechaza un duplicado
  fecha: 2026-11-21
  done: implementé la validación y verifiqué que las pruebas pasan; todo en verde
  qa: probado a mano, funciona
  tests: C1 → api/alta_test.go › «TestAltaDuplicada» — rechaza el segundo
  decisions: ninguna no obvia [fuente: api/alta.go]
  commit: n/a — banco de medición
  lane: lite
  review: aprobado por tech-lead, sobre api/alta.go
EOF
node tools/ops.js check planning; echo "exit=$?"
```

## Síntoma

```
⚠ 2 archivo(s) del molde congelados por edición local; `upgrade` los conserva y no les trae mejoras
✓ planning válido: 0 épica(s), 0 tarea(s) en cola, 1 terminada(s)
exit=0
```

Medido con un contador de sólo lectura sobre `done:` y `qa:`. Cuenta como prueba pegada un exit code, un «código de
salida», `N/M`, o un número seguido de passed/failed/pruebas/tests/verde/ok:

| Instancia | Entradas | Sin prueba pegada |
|---|---|---|
| A (con chequeo propio desde 2026-11-13) | 572 | 43 (8 %) |
| B | 66 | 20 (30 %) |
| C | 108 | 75 (69 %) |
| D | 146 | 52 (36 %) |

Es una heurística y cuenta de más: una tarea de configuración sin suite que correr cae como «sin prueba» aunque su
`qa:` lo justifique. Y antes de agregar la forma `N/M`, D contaba 63 en vez de 52 (`pnpm run test pasó 916/916`), que es
la medida de cuánto se equivoca la forma.

## Causa raíz

`engine/planning/done-entry.js:65-84` (`validateDoneEntry`): comprueba `tests:` (`:68-72`), `commit:` (`:77-79`) y
`decisions:` (`:80-84`). Ni `done:` ni `qa:` aparecen; un grep de `entry.done` en `engine/planning/` no da nada.

## Fix propuesto

Un **aviso** en `check` para la entrada cuyo `done:` y `qa:` juntos no traen ninguna forma de resultado (las de arriba),
salvo una justificación explícita `n/a — razón`, igual que `tests:` y `commit:`. Que rija desde una fecha, o con la
línea de base de adopción (`engine/planning/adoption.js`), para no pintar de amarillo el historial entero: lo cerrado
antes no se arregla editándolo, y reescribirlo para el verde sería fabricar el registro.

## Tradeoffs

- Es una heurística de forma: dice si hay un número, no si el número es cierto. Lo que gana es que «verifiqué que
  pasa» deje de ser una entrada aceptable; un exit code inventado sigue pasando.
- No decide permisos ni lee intención, así que no choca con «un guard no decide con una lista de palabras permitidas»:
  el chequeo pide un dato con forma, no una frase.
- Aviso y no error: como con `review:` (`template/planning/done/README.md`, «Por qué la revisión»), es un hecho del
  pasado. Si después de un tiempo el aviso no baja el número en las instancias, se discute volverlo error.

## Contexto de descubrimiento

Auditoría del 2026-11-21 sobre una instancia sidecar real. Su `check` lo exige desde el 2026-11-13: antes alcanzaba con
nombrar la suite, y de 137 entradas de noviembre, ninguna caía. Después del corte quedó en 8 %. Las otras tres
instancias se midieron para este caso.

## Relacionados

- 472: cerrar un caso no dejaba registro de lo que corrió; es la misma exigencia, del lado del toolkit.

## Cierre

Se recorrió el caso entero:

- **Fix propuesto, un aviso en `check`**: se hizo en `engine/planning/done-entry.js` (`unprovenWarnings`). Cuenta como
  resultado un exit code (`exit 0`, `exit=0`, `exit code`, `exit status`, `código de salida`), un `N/M`, un número con
  su unidad (`41 passed`, `12 pruebas`) o el resumen de `node --test` (`ℹ pass 41`). Una justificación `n/a — razón`
  también vale, en `done:` o en `qa:`.
- **Desde cuándo rige**: se hizo con la fecha de la primera entrada que pega un resultado, no con la adopción. Lo
  anterior se cuenta en una línea y queda como está, y lo adoptado no cuenta. Una instancia que nunca pegó uno sólo cuenta.
- **Tradeoffs, heurística de forma**: queda como decía el caso. La revisión midió formas que no reconoce: `PASS`, `✓ 41`,
  TAP `ok 12 -`, mocha `41 passing`, `$? = 0` y `returned 0`. También midió falsos positivos: `2026/11`, `páginas 1/2`,
  `agregué 2 tests nuevos (sin correr)` y `pasan los tests 2026-11-20`. Es aviso y no frena nada.
- **Tradeoffs, no es una lista de palabras permitidas**: no decide permisos; pide un dato con forma.
- **Tradeoffs, aviso y no error**: hecho. El README de `done/` lo dice.
- **Lo que el enunciado no preveía**: el caso citaba `PROTOCOL.md:171`, y la invariante está hoy en `:175`; se corrigió.
  Una entrada sin `fecha:` o con otro formato se compara como texto, pero esa forma ya es error aparte.

Lo que se corrió:

- Línea de base, en «Síntoma»: las dos entradas pasaban igual.
- Después, `repro-534.sh` en un banco (`repro-534-final.log`): la entrada anterior a la primera pegada se cuenta, la
  posterior se nombra, y `check` sale con exit 0.
- Sobre el molde, cero entradas.
- `test/planning/unproven.test.js`, 3 pruebas, en rojo antes de conectar `check` y en verde después.
- 12 mutaciones en una copia, las 12 rojas: 4 por `sed` y 8 por reemplazo literal.

**Sin probar:** nada más.

### Lista de cierre

1. hecho: la reproducción de «Reproducción» en un banco, antes en «Síntoma» y después en `repro-534-final.log`.
2. hecho: rama `fix/cases-from-an-instance-audit`.
3. hecho: la prueba de `check` en rojo antes de conectarlo y en verde después.
4. hecho: 12 mutaciones en una copia, las 12 rojas.
5. no aplica: no quita nada; agrega un aviso.
6. hecho: banco con la CLI real, sin dobles; el molde da cero.
7. no aplica: no depende de un modelo ni de un runner.
8. hecho: la reproducción y las mutaciones se repitieron sobre la versión final.
9. hecho: entradas antes y después de la primera pegada, y una adoptada, en la misma instancia.
10. hecho: depende sólo `check`; el README de `done/` se actualizó.
11. hecho: seis pasadas de revisión independiente sobre la tanda (530, 531, 533, 534, 535 y 536); ninguna halló nada que impida entregar, sus hallazgos baratos se arreglaron, y cada arreglo se revisó en la pasada siguiente. El último, que tapa los `span` al buscar comentarios en `links.js`, se cerró con su prueba y su mutación en rojo, sin otra pasada.
12. hecho: pasada de comentarios sobre el diff entero en la cuarta revisión; se quitaron los ocho que repetían o sobraban.
13. hecho: `npm run ci` con los archivos nuevos stageados, 1926 de 1926, exit 0.
14. hecho: este cierre recorre el Fix propuesto y los Tradeoffs.
15. hecho: nombra lo corrido con su salida, lo que el enunciado no preveía, y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.124.0` en el frontmatter y en el encabezado; entrada en el CHANGELOG de 0.124.0.
