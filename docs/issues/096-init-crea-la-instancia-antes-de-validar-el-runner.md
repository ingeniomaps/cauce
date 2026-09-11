---
caso: 096
titulo: init crea la instancia antes de validar --runner, y un valor mal escrito deja la instancia hecha y el comando en error
estado: abierto
prioridad: baja
version-detectada: 0.80.0
---

# 096 — `init` valida `--runner` después de escribir la instancia

**🔴 abierto** · detectado en 0.80.0 · prioridad **baja** — no rompe una instancia; deja una a medio configurar
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

El «✓ … creado» y el error salen de la misma corrida.

## Causa raíz

`init` llama a `IN.scaffold` (`engine/cli/ops.js:98`) antes de `BOOT.run` (`ops.js:117`), y es `BOOT.run` el que
rechaza el valor (`engine/cli/bootstrap.js:74-77`). Lo mismo vale para `--integration`, que se valida en el
mismo lugar (`bootstrap.js:80`).

## Fix propuesto

Validar `--runner` y `--integration` antes de `IN.scaffold`, con el mismo mensaje: un valor que no existe
no escribe nada.

## Tradeoffs

Ninguno de conducta para un valor correcto. La validación queda en dos lugares si `BOOT.run` la conserva;
conviene que `init` la llame y `BOOT.run` la reuse, no copiarla.

## Contexto de descubrimiento

2026-09-11, armando el banco de la prueba real del 092: el comando se escribió con `--runner none`, la
instancia quedó creada y la corrida siguiente —`automation install`— funcionó sobre ella sin que nada
avisara que `init` había salido con error.

## Relacionados

- **092** — se encontró probándolo.
