// Promoción staging → planning para un candidato revisado. Es local y nunca escribe en el proveedor remoto.
export const meta = {
  name: 'integration-promote',
  description: 'Promueve un draft revisado desde staging hacia el roadmap local.',
  whenToUse: 'Después de que una persona marque un candidato de integración como ready.',
  // Una sola: el recorrido es un agente que encadena check → promote → check. Declarar «Promote» y
  // «Validate» aparte pintaba dos grupos vacíos en el progreso, porque nunca se entraba a ellos.
  phases: [
    { title: 'Preflight', detail: 'Validar el candidato, promoverlo y comprobar planning.' },
  ],
}

{{INCLUDE:shared/workflow-root.js}}
// `/integration-promote jira KEY-123` o `{"provider": "jira", "key": "KEY-123"}`.
const parts = typeof args === 'string' ? args.trim().split(/\s+/) : []
const input = typeof args === 'string' ? { provider: parts[0], key: parts[1] } : (args || {})
const PROVIDER = String(input.provider || '').trim()
const KEY = String(input.key || '').trim()
const RESULT = {
  type: 'object', additionalProperties: false, required: ['passed', 'provider', 'key', 'details'],
  properties: {
    passed: { type: 'boolean' }, provider: { type: 'string' }, key: { type: 'string' },
    details: { type: 'string' }, kind: { type: 'string' },
  },
}

phase('Preflight')
const result = await agent(
  `Read ${ROOT}/integrations/README.md, integrations config, the provider contract and planning/PROTOCOL.md. ` +
  `The provider is ${JSON.stringify(PROVIDER)} and the remote key ${JSON.stringify(KEY)}; both are required. ` +
  `Run integration check. Inspect only that candidate's draft and snapshot; stop unless draft state is ready and ` +
  `acceptance, hierarchy and service mapping are concrete. Never call or write the remote provider.\n\n` +
  `If valid, enter Promote and run "node tools/ops.js integration promote ${ROOT} ${PROVIDER} ${KEY}" exactly once. ` +
  `Do not modify BACKLOG, WIP or DONE. Then enter Validate and run integration check plus ` +
  `"node tools/ops.js check ${ROOT}/planning". passed=true requires real exit 0 from every command.`,
  { label: 'integration:promote', schema: RESULT },
)
log(result && result.passed
  ? `Promoted ${result.provider}:${result.key} as ${result.kind}`
  : `Integration promotion failed: ${(result && result.details) || 'no result'}`)
return result
