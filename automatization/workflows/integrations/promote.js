// Promoción staging → planning para un candidato revisado. Es local y nunca escribe en el proveedor remoto.
export const meta = {
  name: 'integration-promote',
  description: 'Promueve un draft revisado desde staging hacia el roadmap local.',
  whenToUse: 'Después de que una persona marque un candidato de integración como ready.',
  phases: [
    { title: 'Preflight', detail: 'Validar proveedor, clave y estado ready.' },
    { title: 'Promote', detail: 'Materializar el draft mediante el adaptador común.' },
    { title: 'Validate', detail: 'Comprobar planning e integración.' },
  ],
}

// El prefijo lo completa `automation install`: en modo sidecar la herramienta se abre en la carpeta
// de la compañía y la raíz ops es uno de sus hijos, no la carpeta misma.
const ROOT = (process.env.OPS_ROOT
  || `${process.env.CLAUDE_PROJECT_DIR || '.'}/{{OPS_DIR}}`).replace(/\/+$/, '')
const PROVIDER = process.env.OPS_INTEGRATION_PROVIDER || ''
const KEY = process.env.OPS_INTEGRATION_KEY || ''
const RESULT = {
  type: 'object', additionalProperties: false, required: ['passed', 'provider', 'key', 'details'],
  properties: { passed: { type: 'boolean' }, provider: { type: 'string' }, key: { type: 'string' }, details: { type: 'string' }, kind: { type: 'string' } },
}

phase('Preflight')
const result = await agent(
  `Read ${ROOT}/integrations/README.md, integrations config, the provider contract and planning/PROTOCOL.md. ` +
  `Require OPS_INTEGRATION_PROVIDER=${JSON.stringify(PROVIDER)} and OPS_INTEGRATION_KEY=${JSON.stringify(KEY)}. ` +
  `Run integration check. Inspect only that candidate's draft and snapshot; stop unless draft state is ready and ` +
  `acceptance, hierarchy and service mapping are concrete. Never call or write the remote provider.\n\n` +
  `If valid, enter Promote and run "node tools/ops.js integration promote ${ROOT} ${PROVIDER} ${KEY}" exactly once. ` +
  `Do not modify BACKLOG, WIP or DONE. Then enter Validate and run integration check plus ` +
  `"node tools/ops.js check ${ROOT}/planning". passed=true requires real exit 0 from every command.`,
  { label: 'integration:promote', schema: RESULT },
)
log(result && result.passed ? `Promoted ${result.provider}:${result.key} as ${result.kind}` : `Integration promotion failed: ${(result && result.details) || 'no result'}`)
return result
