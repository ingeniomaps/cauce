---
caso: 096
titulo: init crea la instancia antes de validar --runner, y un valor mal escrito deja la instancia hecha y el comando en error
estado: resuelto
resuelto-en: 0.80.0
prioridad: baja
version-detectada: 0.80.0
---

# 096 — `init` valida `--runner` después de escribir la instancia

**🟢 resuelto en 0.80.0** · detectado en 0.80.0 · prioridad **baja** — no rompe una instancia; deja una a medio configurar
y un código de salida que dice que no se hizo nada. Sube a **media** si un script de alta de proyectos
depende del código de salida de `init`

## Resumen

`init` escribe la instancia entera y recién después valida el valor de `--runner`. Un valor mal escrito
—`none` en vez de `ninguno`— termina con código 2 y el mensaje de error, pero la instancia ya está en disco:
quien lee el código de salida cree que no pasó nada, y el segundo intento encuentra la carpeta creada.

## Reproducción

Desde un checkout de Cauce:

```bash
BANCO=$(mktemp -d)
node engine/cli/ops.js init "$BANCO/acme-ops" --name Acme --mode sidecar --runner none --no-install
echo "exit=$?"
ls "$BANCO/acme-ops"
```

## Síntoma

Salida real, 2026-09-11, sobre la rama del 092 (código de `main` = `e710d620` en esta parte):

```
+ <banco>/acme-ops/planning/rules/system/process.md
+ <banco>/acme-ops/planning/wip/README.md
+ <banco>/acme-ops/tools/ops.js

✓ Acme: sistema ops creado en <banco>/acme-ops (modo sidecar)
--runner debe ser claude, codex, gemini, antigravity, ninguno.
exit=2
```

El «✓ … creado» y el error salen de la misma corrida. Vuelta a correr sobre `main` = `8224d222` al mejorar el
caso, el `ls` sigue listando `ops.config.json`, `organization`, `package.json`, `planning`, `README.md` y
`tools`.

## Causa raíz

`init` llama a `IN.scaffold` (`engine/cli/ops.js:98`) antes de `BOOT.run` (`ops.js:117`), y es `BOOT.run` el que
rechaza el valor, en `validate()` (`engine/cli/bootstrap.js:73-81`). Lo mismo vale para `--integration`, que se
valida en el mismo lugar (`bootstrap.js:80`).

**La prueba que tenía que atraparlo existía.** `init rechaza un runner que no existe`
(`test/instance/instance.test.js:264`) dice en su comentario que *«un runner mal escrito no puede terminar en
una instancia a medio configurar»*, y afirma el código de salida y el mensaje, pero no que la instancia no
se haya creado. Y la de `bootstrap.test.js`, *«una bandera con un valor que no existe se rechaza antes de
tocar el disco»*, llama a `BOOT.run` directo: cubre la función, no el orden en que `init` la llama.

## Fix propuesto

Validar `--runner` y `--integration` antes de `IN.scaffold`, con el mismo mensaje: un valor que no existe
no escribe nada.

## Tradeoffs

Ninguno de conducta para un valor correcto. La validación queda en dos lugares si `BOOT.run` la conserva;
conviene que `init` la llame y `BOOT.run` la reuse, no copiarla.

## Qué tiene que probar el cierre

- Con `--runner` y con `--integration` mal escritos, `init` sale con 2, dice cuáles valores existen y **el
  destino no existe** después: la aserción de ausencia que la prueba de hoy no tiene, vista en rojo.
- La mutación que vuelve a validar después de escribir tiene que ponerla en rojo.
- Un valor correcto sigue creando la instancia: las pruebas de `init` que ya existen siguen en verde.

## Contexto de descubrimiento

2026-09-11, armando el banco de la prueba real del 092: el comando se escribió con `--runner none`, la
instancia quedó creada y la corrida siguiente —`automation install`— funcionó sobre ella sin que nada
avisara que `init` había salido con error.

## Relacionados

- **092** — se encontró probándolo.

## Cierre

**🟢 resuelto en 0.80.0** · `engine/cli/ops.js`, `engine/cli/bootstrap.js`, `test/instance/instance.test.js`

### Contra lo que el caso enumeró

- **Fix propuesto** — hecho: `init` arma las opciones y llama a `BOOT.validate` antes de `IN.scaffold`; si
  el valor no existe sale con 2 y el mismo mensaje, sin escribir nada.
- **Tradeoff «la validación en dos lugares»** — resuelto como proponía: `bootstrap.js` exporta `validate`, la
  misma función que `BOOT.run` sigue llamando; no hay copia.
- **Cada ítem de «Qué tiene que probar el cierre»** — hechos los tres: la aserción de ausencia para
  `--runner` y `--integration` en la prueba que ya existía, las dos mutaciones en rojo, y las pruebas de
  `init` y `bootstrap` en verde con un runner válido.

### Qué se corrió

- **El rojo previo**: con la prueba reforzada y `init` sin tocar —cero llamadas a `BOOT.validate` en
  `ops.js`—, 0 de 1, en la aserción *«el runner mal escrito no deja la instancia creada»*.
- **La reproducción del propio caso**, con el arreglo:

  ```
  exit=2
  --runner debe ser claude, codex, gemini, antigravity, ninguno.
  ¿existe <banco>/acme-ops? no
  ```

  Y con `--runner ninguno`, que es válido: `exit=0` y la instancia creada, `planning/` incluido.
- `node --test test/instance/instance.test.js test/instance/bootstrap.test.js`: 19 de 19.
- **Dos mutaciones, en una copia desechable del repositorio (R23)**, comprobadas aplicadas antes de contar,
  contra una base en verde:

  ```
  M1 valida sólo después de escribir             fail 1 → ROJA
  M2 la validación temprana ignora --integration fail 1 → ROJA
  ```
- `npm run ci`: código 0, 689 de 689, cobertura de 58 archivos en su piso o por encima.
