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
printf '%s\n' "$refs" | while read -r ref sha; do
  branch="${ref#refs/heads/}"
  case "$branch" in automation/?*) ;; *) continue ;; esac
  merged="$(gh pr list --repo "$repo" --head "$branch" --state merged \
    --json headRefOid --jq '.[0].headRefOid // ""')"
  if [ -z "$merged" ]; then continue; fi
  if [ "$merged" != "$sha" ]; then
    echo "$branch cambió después de su merge; no se borra."
    continue
  fi
  gh api --method DELETE "repos/${repo}/git/refs/heads/${branch}"
  echo "$branch borrada: mergeada y sin cambios desde entonces."
done
