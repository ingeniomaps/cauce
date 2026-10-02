---
caso: 225
titulo: merge, aprobar un PR, workflow run y deploy no tienen guard
estado: resuelto
resuelto-en: 0.100.0
prioridad: alta
version-detectada: 0.99.2
---

# 225 — R10 dice que sólo el push tiene forma reconocible, y `gh pr merge`, `gh workflow run` o un deploy declarado sí la tienen

**🟢 resuelto en 0.100.0** · detectado en 0.99.2 · prioridad **alta**.

**Prioridad alta**, y antes de construir hay que decidir: reabre lo que el caso 025 cerró. Las dos instancias construyeron este guard por su cuenta, y globex tuvo dos merges reales sin autorizar (PR #9 y #14).

## Resumen

R10 nombra seis actos de publicación —push, PR, merge, tags, deploy y rollback— y el motor comprueba sólo el push, porque «los otros cinco no tienen una forma reconocible en un comando». Para `gh pr merge`, `gh api …/pulls/N/merge`, aprobar o cerrar un PR, `gh pr create` sin `--repo` y `gh workflow run`, eso no es así. acme-ops (`automatization/bin/acme-delivery-guard.js`, 169 líneas con pruebas) y globex-ops (`automatization/bin/globex-delivery-guard.js`, con pruebas) los frenan y se destraban por chat o por `.ops-approval`; globex agrega deploys declarados por proyecto (terraform/tofu, kubectl, targets de un Makefile) con una lista de lectura cerrada por defecto.

## Reproducción

Pendiente al tomar el caso: en un banco instalado, comprobar que `gh pr merge 1 --repo x/y` no lo frena ningún guard de Cauce.

## Síntoma

Un agente mergea, aprueba o despliega sin que nadie lo autorice; el límite lo sostiene sólo la regla escrita.

## Causa raíz

`engine/hooks/push.js` gobierna sólo `push`. `docs/issues/025-*.md` decidió no gobernar merge ni deploy. R10, en `template/planning/rules/system/commits.md`.

## Fix propuesto

Un guard de entrega con las formas genéricas (`gh` sobre PRs y workflows) en el motor, y las formas de deploy de cada proyecto declaradas en `ops.config.json`, cerradas por defecto (R27). Los ítems pasan por la misma aprobación que el push, y R10 se corrige para decir qué comprueba el motor.

## Tradeoffs

- Contradice una decisión tomada (025): se decide antes de construir.
- Depende de 221: con la confirmación de hoy, el guard se destrabaría con cualquier mensaje.

## Contexto de descubrimiento

Relevamiento de acme-ops y globex-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala.

## Relacionados

- 025 — la decisión que reabre.
- 221 — la confirmación que lo destraba.
- R10.

## Cierre

Resuelto en 0.100.0. Manuel decidió reabrir lo que el 025 había cerrado («sigue con el 225», 2026-10-02),
después de que el 221 hiciera barato aprobar: un clic en el diálogo de Claude Code.

- **Un guard de entrega con las formas genéricas en el motor** — se hizo, en `engine/hooks/delivery.js`. Son
  reglas «con salida» de `destructive`, así que se aprueban como el resto: diálogo de Claude Code, orden por
  chat que las nombre, o la línea exacta en `.ops-approval`. Frenan:
  - Actuar sobre un PR: `gh pr merge|review|close|reopen|comment`, y `gh api …/pulls/N/merge|reviews`.
  - Abrir un PR sin `--repo`/`-R`, porque en un fork `gh` lo resuelve al original.
  - Disparar o publicar: `gh workflow run`, `gh run rerun`, `gh release create|delete|upload|edit`.
  - Desplegar: `terraform`/`tofu apply|destroy|import`, `kubectl` con verbos que modifican,
    `helm install|upgrade|uninstall|rollback|delete`, `pulumi up|destroy|refresh` y `cdk deploy|destroy`, con
    banderas entre el programa y el verbo (`kubectl -n prod apply`, `terraform -chdir=x apply`).

  Las lecturas pasan: `gh pr view|list|checks`, `kubectl get|describe`, `terraform plan`, `helm list`.
- **Las formas de deploy de cada proyecto, declaradas en `ops.config.json`** — se hizo: `deployCommands`, con
  validación y schema. Se comparan por el nombre entero al principio de un comando: `make deploy` frena,
  `make deploy-docs` no.
- **Cerradas por defecto (R27)** — se hizo distinto. Un guard de shell no puede cerrar todos los comandos
  posibles. Lo que no tiene forma conocida ni está declarado —un script propio, un botón— no se frena, y R10
  lo dice ahora con todas las letras: «ése lo sostienen esta regla y el review, no un guard».
- **Corregir R10 para decir qué comprueba el motor** — se hizo, en
  `template/planning/rules/system/commits.md`. El ejemplo de «quien descubre que puede mergear sin que nada lo
  frene» pasó a «desplegar», porque mergear ya se frena. Busqué otros documentos que afirmaran que sólo se
  gobierna el push y no encontré ninguno.
- **Tradeoff: contradice la decisión del 025** — decidido por Manuel. El 025 lleva ahora una línea que apunta
  acá.
- **Tradeoff: depende de 221** — resuelto: el 221 entró antes. Con la confirmación vieja, cualquier mensaje lo
  habría destrabado.

Prueba real:

- **La reproducción**, con el arnés de hooks:
  - Con el motor de `main` antes del arreglo, los nueve comandos pasaban.
  - Con el arreglo, se frenan los seis que publican —merge, review, `gh pr create` sin destino,
    `workflow run`, `kubectl -n prod apply` y `terraform -chdir=infra apply`— y pasan `gh pr view`,
    `kubectl get pods` y `gh pr create --repo`.
- **Una sesión real** (`claude -p`, USD 0,52) sobre un banco con Cauce instalado desde esta rama. Se le pidió
  aplicar terraform sobre un directorio que no existe, que no puede tocar nada aunque pase, sin nombrar el
  comando. El agente informó «el guard de deploy (R10) frenó el comando antes de que corriera terraform», con
  la línea exacta para aprobarlo, y no reintentó. No se probó un merge ni un `kubectl` reales: los dos
  hablarían con un repositorio o un cluster de verdad (R12).
- **Siete mutaciones en una copia, cada una en rojo por `test/hooks/delivery.test.js`:**
  - Sin las reglas.
  - Sin salida.
  - `create` frena aun con `--repo`.
  - Sin banderas entre programa y verbo.
  - Sin lo declarado.
  - Lo declarado comparado como prefijo.
  - Sin validar `deployCommands`.
