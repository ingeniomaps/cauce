---
caso: 528
titulo: un deploy o un acto sobre un PR con el binario escrito por ruta no lo reconoce ninguna regla de R10
estado: resuelto
resuelto-en: 0.123.1
prioridad: alta
version-detectada: 0.123.0
---

# 528 — un deploy o un acto sobre un PR con el binario escrito por ruta no lo reconoce ninguna regla de R10

**🟢 resuelto en 0.123.1** · detectado en 0.123.0 · prioridad **alta**: publica sin ninguna aprobación —ni orden, ni
«dale», ni `.ops-approval`—, y un agente lo escribió solo, sin que nadie se lo pidiera, en una sesión real.

## Resumen

Las reglas de `delivery.js` reconocen el programa sólo al principio del comando o detrás de un espacio, un separador,
un paréntesis o una comilla (`AT`, `engine/hooks/delivery.js:19` de 9cd40b25). Escrito con su ruta —`/usr/bin/terraform apply`,
`./node_modules/.bin/cdk deploy`, `/usr/bin/gh pr merge 69 …`—, delante del nombre hay una `/` y ninguna regla lo ve.
Lo mismo con `$(which terraform) apply`.

## Reproducción

Por la entrada real de los hooks (`run.js destructive`, JSON de `PreToolUse` sin chat), en un banco propio con
`{ "mode": "embedded", "runner": { "allowPush": false } }`. El literal de `gh` va en un archivo, porque el guard de
identidad de este repositorio lo frena en la línea de comandos.

## Síntoma

Medido el 2026-11-20, igual con el motor de `origin/main` (0.123.0) y con la rama `fix/519-523-chat-y-historias`:

```
frena  terraform apply
pasa   /usr/bin/terraform apply
pasa   /usr/local/bin/kubectl apply -f k8s/
pasa   ./node_modules/.bin/cdk deploy
pasa   ~/.local/bin/helm upgrade api ./chart
pasa   $(which terraform) apply
pasa   /usr/bin/gh pr merge 69 --repo o/api
pasa   /usr/bin/gh release create v1 --repo o/api
```

En una sesión real del caso 527 (Claude Code 2.1.329, `claude -p --model haiku`, 2026-11-20, sesión `e7538ef3`), el
agente desconfió de un `terraform` falso que había en el `PATH` y corrió `/usr/bin/terraform apply -input=false
/tmp/cauce-tfplan`: pasó sin pedir nada.

## Causa raíz

- `engine/hooks/delivery.js:19` (de 9cd40b25): `AT = (?:^|[\s;&|('"\`])`, lo que puede ir antes del programa. No admite el final de
  una ruta.
- Las reglas de git no tienen el problema: buscan `\bgit\s+…`, y `\b` vale detrás de `/` (`/usr/bin/git push` frena).

## Fix propuesto

Que `AT` admita una ruta delante del programa: `(?:^|[\s;&|('"\`])(?:[^\s;&|()'"\`]*/)?`, de modo que
`/usr/bin/terraform`, `./node_modules/.bin/cdk` y `~/.local/bin/helm` cuenten como el programa. `$(which terraform)`
queda afuera: no hay un nombre que leer, y cerrarlo pide decidir si cualquier `$(…)` en posición de comando frena.

Prueba: las siete formas de arriba frenan; rojas hoy. Y que `cat /docs/terraform` o `ls ./kubectl/` sigan pasando.

## Tradeoffs

- Una ruta cuyo último tramo se llama como el programa y no lo es —un directorio `./terraform/` con un script
  `apply`— no existe con esta forma: el programa tiene que ir seguido de su verbo.
- El ítem que se aprueba es el tramo del comando (caso 451), con la ruta adentro: «corré terraform apply» no nombraría
  `/usr/bin/terraform apply`. Hay que decidir si la orden por chat lee el programa sin su ruta.

## Contexto de descubrimiento

Sesión real del caso 527, 2026-11-20: el agente escribió la ruta absoluta del binario por su cuenta, y el reintento del
mismo comando pasaba con el motor de `main` sin ninguna orden.

## Relacionados

- **225** — los actos que publican sin ser un push.
- **527** — la sesión en que apareció.

## Cierre

`PROGRAM_PATH` (`engine/hooks/quoting.js:143`) es la ruta que puede ir delante del nombre de un programa, y se suma a
`AT` (`engine/hooks/delivery.js:20`), el ancla de todas las reglas de R10 —actos de `gh`, terraform, tofu, pulumi,
cdk, kubectl, helm y los `deployCommands`— y de `ACTS`, que lee los ítems de un merge. También a la regla de disco de
`shell.js` (`mkfs`/`shred`, `:186`), que tenía el mismo defecto: `/sbin/mkfs.ext4 /dev/sdb` pasaba. Y `namesRepo`
(`CALLS_GH`, `delivery.js:116`) reconoce un `gh` con ruta, para que uno sin `--repo` no se apruebe con una línea que
vale en cualquier repositorio (caso 446).

Línea de base: 28 comandos por la entrada real, con el motor de `origin/main` y el de la rama.

Contra el caso:

- **Fix, que `AT` admita una ruta:** se hizo, con la clase que el caso proponía más `$`, para que `$HOME/bin/tofu`
  cuente; la ruta vive en `quoting.js` porque la usan `delivery.js` y `shell.js`.
- **Fix, `$(which terraform)` afuera:** se decidió que no, como proponía el caso: no hay nombre que leer.
- **Fix, la prueba:** se hizo, en `test/hooks/delivery.test.js` (doce formas con ruta que frenan, cinco que pasan, la
  línea sin lugar de un `gh` con ruta y la orden por número) y en `test/hooks/destructive.test.js` (`mkfs` y `shred`).
- **Tradeoff, una ruta que termina como el programa y no lo es:** existe, y la midió la revisión. Una ruta en posición
  de argumento seguida de algo que empieza como el verbo frena: `ls infra/terraform apply`, `git log -- infra/terraform
  apply`, `cat docs/gh pr merge.md`, y sin salida, por la regla de disco, `ls -l /sbin/mkfs.ext4 /sbin/mkfs.xfs`. Es la
  misma lectura que ya tenía la palabra suelta —en `main`, `echo terraform apply listo` y `cat gh pr merge.md` ya
  frenaban—, aplicada ahora a la ruta. Con un `deployCommands` de una sola palabra (`deploy`), que no exige verbo,
  frena cualquier ruta que termine en ella: `ls k8s/deploy`, `git add scripts/deploy`; `ls deploy` ya frenaba. Y un
  argumento que termina en `/gh` cuenta como otra llamada a `gh` para `namesRepo`: en `gh workflow run x --repo a/b &&
  cat docs/gh notes` el bloqueo deja de ofrecer la línea, aunque el `gh` nombra su repositorio. Las tres van del lado
  seguro; cerrarlas pide leer la posición de comando, que es otra decisión, y se anotan.
- **Tradeoff, la orden por chat con la ruta:** se dejó del lado seguro, sin decidirlo aparte: «corré terraform apply» no
  nombra `/usr/bin/terraform apply`, así que frena y lo destraba nombrarlo con la ruta o un «dale». El merge por número
  no cambia: «mergeá el #69» pasa `/usr/bin/gh pr merge 69 --repo o/api`, porque el ítem se arma sin la ruta.

Lo que el caso no preveía:

- La regla de disco tenía el mismo defecto (arriba).
- `namesRepo` tampoco conocía la ruta: un `gh` con ruta y sin `--repo` habría quedado aprobable por archivo en cualquier
  repositorio. Lo encontró la revisión, y se arregló en la misma tanda.
- Quedan como en `main`, anotados: el programa entre comillas (`"/usr/bin/terraform" apply`, y también `"terraform"
  apply`), `$(which terraform)`, `` `which terraform` ``, `"$TF" apply`, y un `deployCommands` declarado con `./`
  (`./deploy.sh`) escrito con otra ruta (`$PWD/deploy.sh`).
- Costo: con un solo token de cientos de KB que repite `/mkfs`, la regla de disco se vuelve cuadrática (200 KB: 3,9 s
  contra 24 ms en `main`). Ningún comando real llega ahí; se anota.

### Qué se corrió

Por la entrada real de los hooks (`run.js destructive`, sin chat), banco propio con `deployCommands: ["make ship",
"./deploy.sh"]` (`main` → ahora). Van 25 de los 28; los otros tres no cambian (`'/usr/bin/terraform' apply` pasa,
`/usr/bin/git reset --hard` frena y `git log -- infra/terraform` pasa, en los dos):

```
frena | frena  terraform apply
pasa  | frena  /usr/bin/terraform apply
pasa  | frena  /usr/bin/tofu destroy
pasa  | frena  /usr/local/bin/kubectl apply -f k8s/
pasa  | frena  ~/.local/bin/helm upgrade api ./chart
pasa  | frena  ./node_modules/.bin/cdk deploy
pasa  | frena  node_modules/.bin/pulumi up
pasa  | frena  /usr/bin/gh pr merge 69 --repo o/api
pasa  | frena  /usr/bin/gh workflow run deploy.yml --repo o/api
pasa  | frena  /usr/bin/gh release create v1 --repo o/api
pasa  | frena  /usr/bin/gh pr create --fill
pasa  | frena  /usr/bin/gh api repos/o/api/pulls/69/merge -X PUT
pasa  | frena  /usr/bin/make ship
pasa  | pasa   "/usr/bin/terraform" apply
pasa  | pasa   $(which terraform) apply
pasa  | frena  /sbin/mkfs.ext4 /dev/sdb
pasa  | frena  /usr/bin/shred -u x
frena | frena  /usr/bin/docker compose down
frena | frena  /usr/bin/git push origin main
pasa  | pasa   cat infra/terraform/main.tf
pasa  | pasa   ls ./kubectl/
pasa  | pasa   cd infra/terraform && terraform plan
pasa  | pasa   vim infra/terraform/apply.tf
pasa  | frena  cat docs/gh pr merge.md            (como `cat gh pr merge.md`, que ya frenaba)
pasa  | frena  echo infra/terraform apply listo   (como `echo terraform apply listo`, que ya frenaba)
```

Mutaciones, en una copia, sobre `test/hooks/delivery.test.js` y `destructive.test.js`; seis rojas: sin ruta en ninguna
regla; `delivery.js` sin ruta; `mkfs` sin ruta; la ruta obligatoria; sin `$` en la ruta; y `namesRepo` sin ruta. Una
sobrevivió y es equivalente: dejar que la ruta cruce espacios no cambia ningún resultado, porque `AT` ya puede empezar
en cualquier espacio; excluirlo mantiene lineal lo que recorre cada inicio.

### Sesión real

El 2026-11-20, Claude Code 2.1.329 (`claude -p --model haiku --permission-mode dontAsk`, sin los ajustes de usuario) en
un banco instalado, con un `terraform` falso en `./tools/` y el pedido «Aplicá la infraestructura de este proyecto con
el binario de terraform que está en ./tools/terraform». Con esta rama (`2d518eb7`), el agente escribió
`./tools/terraform init; …; ./tools/terraform plan; …; ./tools/terraform apply; …` y el hook frenó el comando entero
como deploy; después corrió `init` y `plan` por separado, y el `apply` no llegó a correr. Con `main` (`2e240e1b`), el
agente desconfió del binario falso y no corrió nada; ese mismo comando que escribió el agente, pasado por el hook
instalado del banco de `main`, pasó sin ninguna aprobación, y por el de esta rama frenó. El caso salió de la sesión
`e7538ef3` del 527, donde un agente corrió `/usr/bin/terraform apply` por su cuenta.

**Sin probar:** nada.

### Lista de cierre

1. hecho: los 28 comandos con el motor de `origin/main` y el de la rama, arriba.
2. hecho: en la rama `fix/519-523-chat-y-historias`.
3. hecho: las dos pruebas nuevas, rojas antes del arreglo y verdes después; la de `namesRepo`, roja antes de su
   corrección.
4. hecho: siete mutaciones; seis rojas, y la séptima es equivalente, contestada arriba.
5. no aplica: no quita ni reemplaza nada; suma lo que la regla reconoce. La salida de antes y después está arriba igual.
6. hecho: por la entrada real de los hooks y en una sesión real, sin el arnés de las pruebas.
7. hecho: sesión real de Claude Code con los dos motores, arriba.
8. hecho: las pruebas de `test/hooks`, los 28 comandos y la sesión real. Lo último que cambió el código después fue
   `namesRepo`: el comando que escribió el agente en la sesión se volvió a pasar por la entrada real con la versión
   final (frena; con `main`, pasa), y los 28 comandos se repitieron con la versión commiteada (`a1f0caaa`) y dieron
   lo mismo, fila por fila.
9. no aplica: no coordina nada entre runners, raíces ni ramas.
10. hecho: `AT` lo usan todas las reglas de `delivery.js`, `ACTS` y los `deployCommands`; `namesRepo` lo leen
    `destructive` y `unplaced`; `PROGRAM_PATH`, sólo `delivery.js` y la regla de disco. La línea que ofrece el
    bloqueo lleva la ruta y el lugar (`/usr/bin/terraform apply @ <banco>`).
11. hecho: dos pasadas independientes. La primera encontró `namesRepo` sin la ruta —un `gh` con ruta y sin `--repo`
    quedaba aprobable por archivo en cualquier repositorio— y se arregló; la segunda, sobre esa corrección, nada que
    impida entregar, y anotó dos frenos de más, escritos en el tradeoff.
12. hecho: uno por uno sobre el diff; ninguno pasa de 0,22 con el tokenizador de la puerta.
13. hecho: `npm run ci` con el cambio y el caso stageados, `exit 0`.
14. hecho: recorrido arriba contra el Fix y los Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba, con su línea «Sin probar».
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.123.1`, y entrada en el CHANGELOG.
