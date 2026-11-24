'use strict'

// Los actos de R10 pedidos a la API de GitHub en vez de a su subcomando de `gh` (caso 539): el merge que `gh pr merge`
// frena salía igual por `gh api graphql`, y el workflow de `gh workflow run`, por un `dispatches`. Se lee la llamada
// —método, ruta, cuerpo— y no el texto, porque la misma ruta es una lectura con GET y un acto con POST.
//
// Frena sólo los actos que R10 nombra (decisión del caso): abrir un issue o etiquetarlo siguen pasando. Las dos
// excepciones, la ruta de issues y GraphQL, van hacia el lado seguro y dicen por qué donde se declaran.

const { segments, shellWord } = require('./quoting')

// Sin método, `gh api` manda POST si la llamada trae campos: «The default HTTP request method is `GET` normally and
// `POST` if any parameters were added» (`gh api --help`, 2.86.0).
const GH_FIELDS = new Set(['-f', '-F', '--field', '--raw-field', '--input'])
const GH_VALUED = new Set([...GH_FIELDS, '-X', '--method', '-H', '--header', '-q', '--jq', '-t', '--template',
  '--hostname', '-p', '--preview', '--cache'])
const CURL_DATA = /^(?:-d|--data(?:-raw|-binary|-urlencode|-ascii)?|--json|-F|--form(?:-string)?)$/
const CURL_PUT = /^(?:-T|--upload-file)$/

// Un número puede llegar en una variable o en el marcador de `xargs -I{}`, y el dueño con el nombre en una sola
// (`repos/$REPO/…`): lo que se mira es la forma de la ruta.
const N = '[^/]+'
const REPO = `repos/${N}(?:/${N})?`
// Las rutas que son un acto con cualquier método que escriba. Un push es mover una ref: crearla, moverla o borrarla
// por la API es lo mismo que `git push`, y el commit que la API escribe sobre una rama también.
const ACTS = [
  [`${REPO}/pulls/${N}/merge`, 'mergea un PR'],
  [`${REPO}/(?:merges|merge-upstream)`, 'mergea una rama'],
  [`${REPO}/pulls/${N}/reviews(?:/${N}(?:/events|/dismissals)?)?`, 'aprueba o revisa un PR'],
  [`${REPO}/pulls/${N}`, 'cierra o cambia un PR'],
  // Abrir un PR por la API nombra el destino en la ruta, y no hay checkout contra el cual compararlo, como hace
  // `delivery` con `gh pr create --repo` (caso 540): frena siempre.
  [`${REPO}/pulls`, 'abre un PR'],
  [`${REPO}/pulls/${N}/(?:comments|update-branch)(?:/${N}/replies)?`, 'escribe en un PR'],
  // Un PR es también un issue: comparte número, y la API de issues lo comenta y lo cierra. Desde acá no se distingue
  // cuál de los dos es, y como comentar o cerrar un PR es un acto de R10, la ruta frena los dos.
  [`${REPO}/issues/${N}(?:/comments)?`, 'comenta o cierra un PR o un issue'],
  [`${REPO}/(?:actions/workflows/${N}/)?dispatches`, 'dispara un workflow'],
  [`${REPO}/actions/(?:runs|jobs)/${N}/(?:rerun|rerun-failed-jobs|approve)`, 'corre un workflow'],
  // `generate-notes` es un POST que sólo arma el texto de una release, sin publicar nada.
  [`${REPO}/releases(?:/(?!generate-notes$)${N}(?:/assets)?)?`, 'publica o cambia una release'],
  [`${REPO}/deployments(?:/${N}/statuses)?`, 'despliega'],
  [`${REPO}/git/refs(?:/.+)?`, 'mueve una rama o un tag, como un push'],
  [`${REPO}/contents/.+`, 'escribe un commit en una rama, como un push'],
].map(([route, act]) => [new RegExp(`^${route}$`), act])

// Como las separa el shell, con las comillas pegadas a la palabra: `-f title="a b"` es una sola.
const tokens = (text) => text.match(/(?:[^\s"']|"(?:[^"\\]|\\.)*"|'[^']*')+|["']/g) || []
// Lo que el shell expande después —una variable, una sustitución— y por eso no se puede leer acá. Entre comillas
// simples no se expande: ahí `$owner` es una variable de la consulta GraphQL.
const expands = (raw) => /(?<!\\)\$/.test(raw.replace(/'[^']*'/g, ''))
const API_HOST = /^(?:https?:\/\/)?(?:[^@/\s]*@)?(?:api|uploads)\.github\.com(?::\d+)?(?=\/|$)/i
// La ruta sin el host, sin la query, sin la barra final y sin el acento grave que cierra una sustitución que la lleva
// dentro: las comillas las separa `tokens`, y el paréntesis de `$( … )`, `segments`.
const routeOf = (url) => url.replace(/`+$/, '').replace(API_HOST, '').replace(/[?#].*$/, '')
  .replace(/^\/+|\/+$/g, '')

// GraphQL se juzga entero y no por acto: saber cuál es exigiría la lista de nombres de mutación, que nace abierta
// a cada una que GitHub agregue. Toda mutación frena, y también la consulta que no se puede leer: la que llega por
// archivo (`-F query=@x`, `--input`), o en una variable o una sustitución que el shell expande después.
function graphql(call, unread) {
  return unread || /(?<![-\w])mutation(?![-\w])/.test(call) ? 'manda una mutación de GraphQL' : ''
}

function actOf(method, route) {
  if (method === 'GET' || method === 'HEAD') return ''
  const hit = ACTS.find(([pattern]) => pattern.test(route))
  return hit ? hit[1] : ''
}

// Las cortas que toman valor, por programa: en curl `-f` y `-q` no lo toman, y en `gh api`, `-f` sí.
const GH_SHORT = 'XfFHqtp'
const CURL_SHORT = 'XdFHTouAebcrmxwKEyYzCUQt'

// `--opción=valor` como `--opción valor`, y `-Xvalor` como `-X valor`. Entre varias cortas juntas, la primera que toma
// valor se lleva el resto de la palabra, o la siguiente si no queda nada: `-iX PUT`, `curl -fsSXDELETE`.
function flagOf(word, valued) {
  const long = /^(--[a-z-]+)=([\s\S]*)$/.exec(word)
  if (long) return [long[1], long[2]]
  const short = new RegExp(`^-[a-zA-Z]*?([${valued}])([\\s\\S]*)$`).exec(word)
  if (!short) return null
  return short[2] ? [`-${short[1]}`, short[2]] : [`-${short[1]}`]
}

function ghApi(raws) {
  const args = raws.map(shellWord)
  let method = ''
  let fields = false
  let unread = false
  let route = ''
  for (let at = 0; at < args.length; at += 1) {
    const joined = flagOf(args[at], GH_SHORT)
    const own = raws[at]
    const [flag, attached] = joined || [args[at]]
    const takes = attached === undefined && GH_VALUED.has(flag)
    const value = takes ? args[at += 1] || '' : attached
    if (flag === '-X' || flag === '--method') method = value
    else if (GH_FIELDS.has(flag)) {
      fields = true
      // Sólo la consulta: una variable en otro campo es un dato de la consulta, que se lee igual.
      const query = /^query=/.test(value || '')
      unread = unread || flag === '--input' || (query && (/^query=@/.test(value) || expands(takes ? raws[at] : own)))
    } else if (value === undefined && !flag.startsWith('-') && !route) route = routeOf(flag)
  }
  if (route === 'graphql') return graphql(args.join(' '), unread)
  return actOf((method || (fields ? 'POST' : 'GET')).toUpperCase(), route)
}

// `curl`, `wget` y httpie hablan con la API sin pasar por `gh`. A GraphQL por un cliente HTTP le va el cuerpo en un
// `-d`, que acá no se lee como consulta, así que frena siempre. Cada cliente con sus banderas: las letras de curl en
// wget o httpie frenaban de más —`wget -T 10` es un plazo y `http -F` sigue redirecciones— (caso 539).
function httpClient(program, args) {
  const at = args.findIndex((one) => API_HOST.test(one))
  if (at === -1) return ''
  // Una redirección pegada, `…/comments<cuerpo.json`, no es parte de la ruta.
  const route = routeOf(args[at].replace(/<.*$/s, ''))
  if (route === 'graphql') return graphql('', true)
  let method = ''
  let data = false
  if (program === 'curl') {
    for (let index = 0; index < args.length; index += 1) {
      const [flag, attached] = flagOf(args[index], CURL_SHORT) || [args[index]]
      const value = attached === undefined ? args[index + 1] : attached
      if (flag === '-X' || flag === '--request') method = value || ''
      else if (flag === '-G' || flag === '--get') method = 'GET'
      else if (CURL_PUT.test(flag)) method = method || 'PUT'
      else if (CURL_DATA.test(flag)) data = true
    }
  } else if (program === 'wget') {
    for (let index = 0; index < args.length; index += 1) {
      const [flag, attached] = args[index].split(/=(.*)/s)
      if (flag === '--method') method = attached === undefined ? args[index + 1] || '' : attached
      else if (/^--(?:post|body)-(?:data|file)$/.test(flag)) data = true
    }
  } else {
    // Con httpie y xh, el método es una palabra antes de la URL. Sin método, httpie manda POST si hay cuerpo: campos
    // `clave=valor`, `clave:=json` o `clave@archivo` —`clave==valor` es la query y `Clave:valor`, una cabecera—,
    // `--raw`, o stdin, y stdin cuenta con sólo no ser una terminal (`_guess_method` y `has_stdin_data` en
    // httpie/cli/argparser.py, leído el 2026-11-22). Un agente corre sin terminal, así que sin método ni
    // `--ignore-stdin` es POST. Que xh haga lo mismo no está comprobado: se lo trata igual, del lado que frena.
    // Antes de la URL, aunque una bandera los separe: `http POST -v URL`.
    method = args.slice(0, at).find((one) => /^(?:GET|POST|PUT|PATCH|DELETE|HEAD)$/i.test(one)) || ''
    data = args.slice(at + 1).some((one) => /^[^-=:@][^=:@]*(?::=|=(?!=)|@)/.test(one))
      || args.some((one) => one === '--raw' || one.startsWith('--raw='))
      // `-I` también agrupado (`-vI`), pero no como valor pegado de una bandera que lo lleva (`-oIndex`).
      || !args.some((one) => one === '--ignore-stdin' || /^-(?![pPosaA])[A-Za-z]*I[A-Za-z]*$/.test(one))
  }
  return actOf((method || (data ? 'POST' : 'GET')).toUpperCase(), route)
}

const CALL = /(?:^|[\s('"`])(?:[^\s;&|()<>'"`]*\/)?(gh\s+api|curl|wget|https?|xh)(?=\s)/g

// Los tramos del comando que piden un acto a la API, enteros, para que se aprueben como se escribieron. Una lectura no
// devuelve nada, y entonces la regla no frena.
function apiActs(command) {
  const text = String(command)
  const found = []
  for (const { start, end } of segments(text)) {
    const stretch = text.slice(start, end)
    for (const call of stretch.matchAll(CALL)) {
      const raws = tokens(stretch.slice(call.index + call[0].length))
      const program = call[1].startsWith('gh') ? 'gh' : call[1]
      const act = program === 'gh' ? ghApi(raws) : httpClient(program, raws.map(shellWord))
      if (act) found.push({ text: stretch.trim(), act })
    }
  }
  return found
}

module.exports = { apiActs }
