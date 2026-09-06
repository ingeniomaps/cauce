---
caso: 023
titulo: R12 manda las excepciones de sistemas externos a AGENTS.md, y AGENTS.md las manda a workspace.md
estado: abierto
prioridad: alta
version-detectada: 0.60.1
---

# 023 — Dos archivos del toolkit señalan lugares distintos para la misma excepción

**🔴 abierto** · detectado en 0.60.1 · prioridad **alta** — quien siga la regla escribe donde `upgrade` borra

## Resumen

R12 cierra diciendo que las excepciones sobre sistemas externos **se documentan en el `AGENTS.md` del
proyecto**. `AGENTS.md` dice dos veces lo contrario: que el entorno concreto y las excepciones de
autonomía viven en `organization/workspace.md`, y que él mismo es del toolkit y se reemplaza entero al
actualizar.

Las dos frases vienen en el mismo paquete. Quien obedezca la regla escribe su excepción en un archivo
que `upgrade` sobrescribe; quien obedezca `AGENTS.md` la escribe bien, pero contradiciendo la regla que
la pedía.

## Reproducción

```bash
mkdir repo && cd repo && git init -q .
npx @ingeniomaps/cauce@0.60.1 init ops --mode sidecar --install

grep -n 'se documentan en el' ops/planning/rules/system/conduct.md
grep -n 'organization/workspace.md' ops/AGENTS.md | head -2
```

## Síntoma

`ops/planning/rules/system/conduct.md:13`:

```
Las excepciones se documentan en el `AGENTS.md` del proyecto, nombrando el entorno concreto.
```

`ops/AGENTS.md:11`:

```
entorno concreto y las excepciones de autonomía viven en **`organization/workspace.md`**, que es del
proyecto y no se reemplaza al actualizar.
```

## Causa raíz

`template/planning/rules/system/conduct.md:13`. El texto de R12 quedó de cuando el mapa y las
excepciones vivían en `AGENTS.md`; el [008](008-el-readme-manda-completar-un-archivo-del-toolkit.md) los
movió a `organization/workspace.md` y actualizó `AGENTS.md`, pero no la regla que apunta ahí.

Es el mismo rastro que dejaron el [016](016-el-workflow-onboard-manda-escribir-el-mapa-en-agents-md.md) y
el [017](017-autobuild-lee-los-limites-solo-de-agents-md.md): archivos que quedaron atrás de aquel
cambio. Los dos eran workflows; éste es una regla del sistema, que es la superficie que un proyecto lee
para saber qué se espera de él.

## Fix propuesto

```diff
-Las excepciones se documentan en el `AGENTS.md` del proyecto, nombrando el entorno concreto.
+Las excepciones se documentan en `organization/workspace.md`, nombrando el entorno concreto: ese
+archivo es del proyecto y `upgrade` no lo toca.
```

El barrido que pedía este párrafo ya se hizo: `grep -rn "AGENTS\.md" template/planning/rules/system/*.md`
devuelve **una sola línea**, la de R12. Ninguna otra regla del sistema manda a escribir ahí, así que el
arreglo es esa línea y nada más. Queda escrito para que nadie vuelva a pagar la búsqueda.

El destino existe y ya tiene su sección: `template/organization/workspace.md:27`, `## Excepciones de
autonomía`, con el texto que explica que los límites que rigen sin escribir nada están en `AGENTS.md` y
lo de este proyecto va acá.

## Tradeoffs

Ninguno visible: el destino ya existe, ya tiene sección para eso y ya es el que `AGENTS.md` nombra. El
cambio es de una línea y alinea la regla con el diseño vigente.

Lo que sí cambia es el alcance: R12 vive en `template/planning/rules/system/`, así que la corrección baja
a todos los consumidores en su próximo `upgrade`. Es lo que corresponde —hoy la regla manda a cada uno de
ellos a escribir en un archivo que se reemplaza entero— pero no es una decisión de estilo.

## Contexto de descubrimiento

Auditando qué reglas del sistema delegan algo al proyecto, para ver si `gouduet` las había respondido
todas (2026-09-06). Sólo dos delegan: R7 —los números de tamaño, que el proyecto ya había fijado— y R10
—la autorización de publicación—. Al leer R12 completa para confirmar que las integraciones estaban bien
declaradas, apareció la contradicción. En ese proyecto las excepciones estaban en `workspace.md`, o sea
en el lugar correcto por `AGENTS.md` y en el equivocado por R12.

## Relacionados

- [008](008-el-readme-manda-completar-un-archivo-del-toolkit.md) — el cambio que movió el destino.
- [016](016-el-workflow-onboard-manda-escribir-el-mapa-en-agents-md.md) y
  [017](017-autobuild-lee-los-limites-solo-de-agents-md.md) — los otros dos archivos que quedaron atrás.
