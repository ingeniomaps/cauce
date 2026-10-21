---
caso: 396
titulo: migrar una línea cuya rama ya está empujada con PR abierto deja bases de merge cruzadas
estado: descartado
prioridad: baja
version-detectada: 0.111.0
---

# 396 — `ops lines migrate` trae la línea con un merge aunque su rama ya esté publicada con un PR abierto, y la rama que la recibe queda con bases de merge cruzadas

**⚪ descartado** · detectado en 0.111.0 · prioridad **baja**: sólo alcanza a quien todavía tenga líneas de antes de
0.111.0 sin migrar, y la instancia que lo encontró ya migró las suyas. Cuando los dos PR llegan a la rama viva por separado, el
de la instancia queda marcado con conflictos en GitHub aunque git lo resuelva solo, y hay que traer la rama viva a
mano para poder mergearlo. No avisa al migrar.

## Resumen

Una línea de antes de 0.111.0 vive en `line/<nombre>` de la instancia, y lo normal es que esa rama esté empujada con
su PR a la rama viva. `ops lines migrate --apply` la trae a la rama de la instancia con `git merge --no-ff` y borra
la rama local, pero no mira si tiene remoto ni PR. Desde ahí los mismos commits viajan por dos caminos: el PR de la
línea y el PR de la rama de la instancia.

## Reproducción

En una instancia real, el 2026-10-19, con el motor 0.111.0:

1. `line/auth` y `line/admin` empujadas, con los PR #71 y #72 abiertos contra `main`.
2. `ops lines migrate . auth frontend-auth --apply` y `ops lines migrate . admin admin --apply` desde la instancia en
   una rama de trabajo, que después se empujó como PR #76.
3. Se mergearon #71 y #72 en `main`, y después se intentó mergear #76.

## Síntoma

```
$ gh pr merge 76 --merge
GraphQL: Pull Request has merge conflicts (mergePullRequest)
$ gh pr view 76 --json mergeable,mergeStateStatus
{"mergeStateStatus":"DIRTY","mergeable":"CONFLICTING"}
$ git merge-tree --write-tree origin/main chore/lines-on-cauce-0.111 >/dev/null; echo exit=$?
exit=0
$ git merge-base --all origin/main chore/lines-on-cauce-0.111
ad425869c33e206776978b7eac0372b9bfbc345b
36891d7d067999ac21f8a62498a25e60e5593d00
d61942eea55756981c70db4ffedeba53f92e0ffe
595627e0fd9a3a14cfbe6e29ad44fe381ca5f18b
```

`d61942e` y `595627e` son las puntas de `line/auth` y `line/admin`: las dos bases que puso la migración. Las otras
dos (`36891d7`, `ad42586`) son de dos ramas de la propia instancia que también se mergearon en la rama de trabajo y
llegaron a `main` por su PR. Se destrabó mergeando `origin/main` en la rama de la instancia y empujando: el PR pasó a
`MERGEABLE`.

**Hipótesis, no comprobada aislada**: que las dos bases de la migración solas ya basten para que GitHub marque el PR
con conflictos. Se comprueba repitiendo la reproducción sin otros merges en la rama de la instancia.

## Causa raíz

`engine/cli/lines-join.js:261` mergea `line/<nombre>` en la rama de la instancia sin mirar si tiene upstream, y
`:269` borra la rama local. El remoto y su PR quedan vivos, con los mismos commits que ahora también trae la rama de
la instancia.

## Fix propuesto

**Primero, la hipótesis de arriba.** Antes de construir un freno se repite la reproducción con sólo la migración en la
rama de la instancia: si GitHub no marca conflicto con las dos bases de la migración solas, el defecto es otro y este
fix no lo cierra.

Si se confirma: al migrar, si `line/<nombre>` existe en algún remoto y no está contenida en la rama viva:

- en seco, decirlo: «`line/<nombre>` está empujada y no llegó a `<viva>`: mergeá su PR antes, o la rama que la
  reciba va a cruzarse con él»;
- con `--apply`, negarse con ese mismo texto, salvo que la rama ya esté contenida en la rama viva, que es cuando el
  merge no aporta commits nuevos y no cruza nada.

La aceptación pide la mutación: con la comprobación del upstream quitada, la prueba que migra una línea con remoto no
mergeado tiene que ver el merge hecho y fallar.

Que exista en un remoto se mira por `refs/remotes/*/line/<nombre>` (`git for-each-ref`), no por
`<rama>@{upstream}`: una rama empujada sin `-u` no tiene upstream configurado y el upstream solo la dejaría pasar.

## Tradeoffs

- Obliga a mergear antes el PR de la línea, que puede estar esperando revisión.
- Saber si hay un PR abierto pide hablar con el forge; mirar las referencias remotas es local y cubre el caso, salvo
  un remoto que no se trajo con `fetch`.

## Contexto de descubrimiento

Al migrar las dos líneas de una instancia real a la disposición de 0.111.0 y mergear sus PR.

## Relacionados

- 397 — la misma migración trae el planning a cualquier rama.
- 394 — la disposición nueva que hace necesaria la migración.

## Cierre

**Descartado: medido en GitHub, el defecto que el caso atribuía a la migración no ocurre.** Las bases de merge
cruzadas que deja `migrate` no hacen que GitHub marque el PR de la instancia con conflictos. Lo que dejó en `DIRTY`
el PR #76 de la instancia fue otra cosa, que esta medición no reprodujo.

El enunciado, ítem por ítem:

- **Primero, la hipótesis**: se midió, y es falsa. Detalle abajo.
- **En seco, decirlo; con `--apply`, negarse**: se decidió que no, ninguna de las dos. Se llegó a construir un aviso
  («`line/<nombre>` está empujada … Mergeá su PR antes»), y se sacó antes de publicarse: mandaba a hacer algo que la
  medición mostró innecesario. Que el PR de la línea y el de la instancia lleven los mismos commits es cierto, pero
  no le cuesta nada a nadie: el que llega segundo queda sin cambios propios. El comentario de `arrival`
  (`engine/cli/lines-join.js`) dice por qué no avisa, para que no se vuelva a agregar.
- **Mirar el remoto por `refs/remotes` y no por `@{upstream}`**: ya no aplica.
- **Tradeoffs**: no aplican.

Lo que sí quedó de esta revisión es el aviso del 397, la otra mitad de la misma migración, que sigue en pie.

**Lo que se corrió.**

- La parte de git, sobre `ops bench sidecar` con un remoto bare de verdad: dos líneas de antes (`line/auth`,
  `line/admin`) empujadas, migradas con `--apply` en `build/cauce-0.112.0`, y sus PR mergeados en `main` del remoto
  desde un clon aparte. `git merge-base --all origin/main build/cauce-0.112.0` devuelve `cd27f57` y `511e428`, las
  puntas de las dos líneas, y `git merge-tree --write-tree` sale 0.
- **La parte de GitHub**, el 2026-10-20, en un repositorio privado desechable (`ingeniomaps/cauce-probe-396`, creado
  para esto y borrado al terminar), con PR de verdad y merges con merge commit:
  - **Dos bases:** `line/auth` y `line/admin` empujadas con sus PR (#1, #2), y una rama de la instancia que las trae
    con `merge --no-ff`, como `migrate`, con el suyo (#3). Antes de mergear, #3 estaba en `MERGEABLE CLEAN`. Después
    de mergear #1 y #2, `git merge-base --all` daba las dos puntas (`619003a`, `7253e49`), y #3 seguía en
    `MERGEABLE CLEAN`.
  - **Cuatro bases, la forma de la reproducción original:** dos líneas más y dos ramas propias de la instancia
    (`build/upgrade`, `chore/otra`), todas mergeadas en la rama de la instancia y cada una con su PR (#4–#7). Después
    de mergear las cuatro, las bases eran exactamente esas cuatro puntas, y el PR de la instancia (#8) seguía en
    `MERGEABLE CLEAN`.
- La quita, probada al revés: `test/wiring/lines.test.js`, «migrar avisa si la instancia no está en su rama viva, y no
  por una línea empujada», aserta que con `origin/line/vieja` sin llegar a `main` la salida no dice «empujada» ni «dos
  caminos». Con el aviso devuelto en una copia fuera del árbol, roja (`expected to not match /empujada|dos caminos/`).
