'use strict'

// Vocabulario común de paradas. Una parada sin nombre obliga a quien la recibe —persona, supervisor o
// workflow— a reconstruir del estado entero qué pasó, y es lo primero que se pierde cuando cada runner
// inventa su propia frase. `context` emite las dos que puede determinar solo; el resto las nombra la
// fase que para.
//
// Por familia, que es el tramo donde paró y lo que dice quién la destraba. Eran diez nombres sueltos y el
// recorrido paraba con cuarenta: cada parada nueva nacía en `autobuild` y nada la comparaba con esta lista
// (caso 390). La compara ahora `autobuild-stops.test.js`, en los dos sentidos.
const STOP_FAMILIES = {
  Arranque: ['adapter-stale', 'agent-unavailable', 'contract-unavailable', 'context-unavailable', 'root-unreadable'],
  Cola: ['queue-unavailable', 'claim-stuck', 'manual-held', 'manual-critical', 'worktree-failed'],
  Persona: ['awaiting-review', 'blocked-on-human', 'governance-approval-needed'],
  Preparación: ['not-ready', 'refine-not-applied', 'refine-unwritable', 'split-not-applied',
    'split-left-dependents'],
  Plan: ['plan-rejected', 'plan-blocked', 'critique-unbacked', 'wip-malformed', 'wip-not-persisted'],
  Construcción: ['build-blocked', 'build-closed-task', 'build-unproven', 'edge-unproven'],
  Revisión: ['review-blocked', 'review-failed', 'review-unbacked', 'review-unverified'],
  Verificación: ['verify-failed', 'verify-hollow', 'verify-untested', 'acceptance-ambiguous', 'qa-failed'],
  Cierre: ['commit-failed', 'commit-needs-approval', 'planning-check-failed', 'milestone-too-long'],
}
const STOP_REASONS = Object.values(STOP_FAMILIES).flat()
// Las que la lista nombraba y ningún recorrido emitía, con la que las reemplaza. Un runner propio pudo haberlas
// usado porque el protocolo decía «en cualquier runner», así que se deprecan en vez de borrarse, y se borran
// en 1.0.0.
const DEPRECATED_STOP_REASONS = {
  'review-unresolved': 'review-failed',
  'verify-regression': 'verify-failed',
  'verify-inconsistent': 'verify-failed',
  'budget-low': 'milestone-too-long',
}

module.exports = { STOP_FAMILIES, STOP_REASONS, DEPRECATED_STOP_REASONS }
