#!/usr/bin/env bash
# Borra las ramas `automation/*` que ya están en `main`: las de los informes `propone: no`, que mergea el
# auto-merge del bot. Las que mergea una persona desde la web las borra `delete_branch_on_merge`; éstas
# no, porque el `closed` del bot no dispara nada (caso 183).
#
# Se corre a mano, una vez, al destrabar la tanda —«Destrabar una tanda de investigación» en
# `AGENTS.md`—, y no como workflow. Hubo dos: uno en cada cierre de PR y otro en cada corrida del ciclo.
# El primero, en sus últimas cien corridas (2026-09-15 a 09-24), no borró ninguna rama —98 ya las había
# borrado quien mergeó—: gastaba CI en algo que sólo hace falta el día de la tanda.
#
# Borra sólo lo que puede probar que ya está en `main`: un PR mergeado cuyo head es el commit en que la
# rama está. Una rama que alguien movió después del merge es trabajo vivo.
set -euo pipefail
repo="${GITHUB_REPOSITORY:-ingeniomaps/cauce}"
refs="$(gh api --paginate "repos/${repo}/git/matching-refs/heads/automation/" \
  --jq '.[] | "\(.ref) \(.object.sha)"')"
failed=0
while read -r ref sha; do
  branch="${ref#refs/heads/}"
  case "$branch" in automation/?*) ;; *) continue ;; esac
  merged="$(gh pr list --repo "$repo" --head "$branch" --state merged \
    --json headRefOid --jq '.[0].headRefOid // ""')"
  if [ -z "$merged" ]; then continue; fi
  if [ "$merged" != "$sha" ]; then
    echo "$branch cambió después de su merge; no se borra."
    continue
  fi
  # Entre listar y borrar, otra mano puede llegar antes —un merge con `--delete-branch`—, y eso no es un
  # fallo del barrido: se dice y se sigue. Un 422 cortaba el resto con `set -e` y dejaba ramas vivas.
  if ! out="$(gh api --method DELETE "repos/${repo}/git/refs/heads/${branch}" 2>&1)"; then
    if gh api "repos/${repo}/git/ref/heads/${branch}" >/dev/null 2>&1; then
      echo "$branch no se pudo borrar: $out" >&2
      failed=1
    else
      echo "$branch ya no estaba: la borró otro antes."
    fi
    continue
  fi
  echo "$branch borrada: mergeada y sin cambios desde entonces."
done < <(printf '%s\n' "$refs")
exit "$failed"
