'use strict'

// Caso 539: los actos de R10 pedidos a la API de GitHub —por `gh api`, GraphQL o un cliente HTTP— frenan como su
// subcomando de `gh`, y lo que la API sólo lee sigue pasando. Se aprueban igual que el resto de `delivery`.

const { blocked, chatSession, messageOf, pushRoot, pasteApproval } = require('../support/hooks-harness')
const test = require('node:test')
const assert = require('node:assert/strict')
const { execute } = require('../../engine/hooks/run')

const run = (root, command) => ({ cwd: root, tool_input: { command } })
const API = /API de GitHub un acto que R10/

test('un acto de R10 pedido a la API frena, por gh api, GraphQL o un cliente HTTP', () => {
  const root = pushRoot('cauce-api-acto-')
  for (const command of [
    'gh api -X POST repos/acme/app/actions/workflows/deploy.yml/dispatches -f ref=main',
    'gh api repos/acme/app/dispatches -f event_type=deploy',
    'gh api --method=POST repos/acme/app/actions/runs/7/rerun',
    `gh api graphql -f query='mutation { mergePullRequest(input:{pullRequestId:"X"}) { clientMutationId } }'`,
    'gh api graphql -F query=@merge.graphql',
    'gh api graphql --input body.json',
    'gh api -XPUT /repos/acme/app/pulls/12/merge',
    'gh api -X PATCH repos/acme/app/pulls/12 -f state=closed',
    'gh api -X PATCH repos/acme/app/issues/12 -f state=closed',
    'gh api repos/acme/app/issues/12/comments -f body=listo',
    'gh api repos/acme/app/pulls/12/reviews -f event=APPROVE',
    'gh api repos/acme/app/merges -f base=main -f head=feature',
    'gh api -X POST repos/acme/app/releases -f tag_name=v1',
    'gh api -X DELETE repos/acme/app/git/refs/heads/develop',
    'gh api -X PATCH repos/acme/app/git/refs/heads/main -f sha=abc -F force=true',
    'gh api -X PUT repos/acme/app/contents/README.md -f message=x -f content=eA==',
    'curl -X PUT -H "Authorization: token $T" https://api.github.com/repos/acme/app/pulls/12/merge',
    'curl --request=POST https://api.github.com/repos/acme/app/dispatches',
    'curl -d \'{"event_type":"deploy"}\' https://api.github.com/repos/acme/app/dispatches',
    'curl -H "Authorization: bearer $T" https://api.github.com/graphql',
    'wget --post-data=x https://api.github.com/repos/acme/app/dispatches',
    'http POST https://api.github.com/repos/acme/app/pulls/12/reviews event=APPROVE',
    'https api.github.com/x; https PUT https://api.github.com/repos/acme/app/pulls/12/merge',
    'git status && gh api -X POST repos/acme/app/dispatches',
    'bash -c "gh api -X PUT repos/acme/app/pulls/12/merge"',
    '/usr/bin/gh api -X PUT repos/acme/app/pulls/12/merge',
    'gh api graphql -Fquery=@merge.graphql',
    'http https://api.github.com/repos/acme/app/dispatches event_type=deploy',
    'curl -X POST https://example.com/x https://api.github.com/repos/acme/app/dispatches',
    'bash -c "gh api user; gh api -X PUT repos/acme/app/pulls/12/merge"',
    // Lo que encontró la revisión: valores con comillas pegadas, `--opción=valor`, la barra final, el número o el
    // repositorio en una variable, la consulta que el shell expande y las formas de la URL.
    'gh api -X PUT -f commit_title="Merge it" repos/acme/app/pulls/12/merge',
    'gh api -f body=\'hello world\' repos/acme/app/pulls/12/reviews -f event=APPROVE',
    'gh api -H\'Accept: application/vnd.github+json\' -X PUT repos/acme/app/pulls/12/merge',
    'gh api repos/acme/app/pulls/12/reviews --field=event=APPROVE',
    'gh api repos/acme/app/pulls/12/reviews --input=review.json',
    'gh api graphql --field=query=@q',
    'gh api -X PUT repos/acme/app/pulls/12/merge/',
    'gh api -X PUT repos/acme/app/pulls/12/reviews/9 -f body=x',
    'gh api -X PUT repos/acme/app/pulls/$N/merge',
    'gh api -X PUT "repos/$REPO/pulls/12/merge"',
    'xargs -I{} gh api -X PUT repos/acme/app/pulls/{}/merge',
    'gh api graphql -f query="$(cat q.graphql)"',
    'gh api graphql -f query="$MUT"',
    'gh api -X POST repos/acme/app/actions/runs/7/approve',
    'gh api -X POST repos/acme/app/merge-upstream -f branch=main',
    'gh api -X POST repos/acme/app/deployments -f ref=main',
    'curl -X POST https://uploads.github.com/repos/acme/app/releases/1/assets?name=x',
    'curl -X POST https://API.GITHUB.COM/repos/acme/app/issues/12/comments',
    'curl -X POST https://user:tok@api.github.com:443/repos/acme/app/issues/12/comments',
    'curl -T x.json https://api.github.com/repos/acme/app/issues/12/comments',
    'http -a u:t PUT https://api.github.com/repos/acme/app/pulls/12/merge',
    'http PUT api.github.com/repos/acme/app/pulls/12/merge',
    'xh PUT https://api.github.com/repos/acme/app/pulls/12/merge',
    'echo `gh api -X PUT repos/acme/app/pulls/12/merge`',
    'x=$(gh api -X PUT repos/acme/app/pulls/12/merge)',
    'gh api -iX PUT repos/acme/app/pulls/12/merge',
    'curl -sXDELETE https://api.github.com/repos/acme/app/git/refs/heads/main',
    'curl -sXPATCH https://api.github.com/repos/acme/app/pulls/12',
    'gh api -iXDELETE repos/acme/app/git/refs/heads/main',
    'gh api repos/acme/app/pulls/12/merge -fmerge_method=squash',
    'curl -fsSX POST https://api.github.com/repos/acme/app/pulls/12/merge',
    'curl -sfX PUT https://api.github.com/repos/acme/app/pulls/12/merge',
    'curl -fsSd x https://api.github.com/repos/acme/app/dispatches',
    'curl -fT f.zip https://uploads.github.com/repos/acme/app/releases/1/assets',
    'gh api repos/org/app/pulls -f head=me:b -f base=main -f title=x',
    'curl -X POST https://api.github.com/repos/org/app/pulls -d @b.json',
    'curl -sX POST https://api.github.com/repos/acme/app/actions/runs/1/rerun',
    'curl -sd x https://api.github.com/repos/acme/app/dispatches',
    'http api.github.com/repos/acme/app/issues/12/comments body:=\'"x"\'',
    'http api.github.com/repos/acme/app/issues/12/comments body@cuerpo.json',
    'gh api graphql -F n=1 -f query="$Q"',
  ]) blocked('destructive', run(root, command), API)
})

test('lo que la API sólo lee, o lo que R10 no nombra, sigue pasando', () => {
  const root = pushRoot('cauce-api-lectura-')
  for (const command of [
    'gh api repos/acme/app/pulls/12',
    'gh api repos/acme/app/pulls/12/merge',
    'gh api repos/acme/app/pulls/12/reviews',
    'gh api -X GET repos/acme/app/releases -f per_page=5',
    `gh api graphql -f query='{ viewer { login } }'`,
    'gh api repos/acme/app/issues/12/labels -f "labels[]=bug"',
    'gh api -X POST repos/acme/app/issues -f title=x',
    'gh api user',
    'curl https://api.github.com/repos/acme/app/pulls/12',
    'curl -X POST https://example.com/repos/acme/app/dispatches',
    'curl -sI https://api.github.com',
    'wget -qO- https://api.github.com/repos/acme/app/releases',
    'http https://api.github.com/repos/acme/app/pulls/12',
    'curl -X HEAD https://api.github.com/repos/acme/app/pulls/12/merge',
    'gh api -XGET repos/acme/app/releases -f per_page=5',
    'gh issue comment 12 --body listo',
    `gh api graphql -f query='query { repository(owner:"o",name:"mutation-tools"){ id } }'`,
    `gh api graphql -F owner=o -f query='query($owner:String!){ user(login:$owner){ id } }'`,
    'curl -G -d per_page=100 https://api.github.com/repos/acme/app/issues/12/comments',
    'curl --head https://api.github.com/repos/acme/app/pulls/12/merge',
    'curl -sSfLo out.json https://api.github.com/repos/acme/app/pulls/12/merge',
    'curl -fsSL -w "%{http_code}" https://api.github.com/repos/acme/app/dispatches',
    'echo "gh api -X PUT repos/acme/app/pulls/12/merge"',
    'git commit -m "fix: frena curl -X POST https://api.github.com/repos/acme/app/dispatches"',
    `gh api graphql -f query='query($n:Int!){ x(n:$n) { id } }' -F n=$N`,
    `gh api graphql -F number="$PR" -f query='query($number:Int!){ x(n:$number) { id } }'`,
    String.raw`gh api graphql -f query="query(\$id:Int!){ x(id:\$id) { name } }" -F id=1`,
    'http api.github.com/repos/acme/app/issues/12/comments per_page==100',
    'http api.github.com/repos/acme/app/pulls/12 Authorization:"token abc=="',
    'gh api repos/acme/app/releases/generate-notes -f tag_name=v1',
  ]) assert.doesNotThrow(() => execute('destructive', run(root, command)), command)
})

test('el acto por la API se aprueba como el resto: por el chat o con la línea en .ops-approval', () => {
  const root = pushRoot('cauce-api-salida-')
  const dispatch = 'gh api -X POST repos/acme/app/actions/workflows/deploy.yml/dispatches -f ref=main'
  const chat = chatSession()
  try {
    assert.doesNotThrow(() => execute('destructive', chat.says(`corré ${dispatch}`)(run(root, dispatch))))
  } finally { chat.close() }
  blocked('destructive', run(root, dispatch), API)
  pasteApproval(root, messageOf('destructive', run(root, dispatch)))
  assert.doesNotThrow(() => execute('destructive', run(root, dispatch)))
  blocked('destructive', run(root, dispatch.replace('deploy.yml', 'otro.yml')), API)
})

test('el repositorio escrito antes del subcomando de gh no esconde el acto', () => {
  const root = pushRoot('cauce-api-repo-antes-')
  for (const command of ['gh -R acme/app pr merge 12', 'gh -Racme/app pr merge 12', 'gh -Racme/app workflow run x',
    'gh -R otro/app -R acme/app pr merge 12', 'gh --repo acme/app pr review 12 --approve',
    'gh --repo=acme/app pr close 12', 'gh -R acme/app workflow run deploy.yml', 'gh -R acme/app release create v1',
  ]) blocked('destructive', run(root, command), /R10/)
  assert.match(messageOf('destructive', run(root, 'gh -R acme/app pr merge 12')), /gh pr merge 12 --repo acme\/app/)
  // Como `gh`, gana el último: el `-R` de antes del subcomando no pisa al de después.
  assert.match(messageOf('destructive', run(root, 'gh -R otro/x pr merge 12 --repo acme/app')),
    /gh pr merge 12 --repo acme\/app/)
  assert.doesNotThrow(() => execute('destructive', run(root, 'gh -R acme/app pr view 12')))
})
