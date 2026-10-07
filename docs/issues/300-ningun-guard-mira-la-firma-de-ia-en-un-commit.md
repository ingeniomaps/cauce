---
caso: 300
titulo: ningún guard mira la firma de IA en un commit
estado: resuelto
resuelto-en: 0.103.5
prioridad: baja
version-detectada: 0.103.4
---

# 300 — R8 prohíbe las firmas de IA y sólo la cumple quien la leyó

**🟢 resuelto en 0.103.5** · detectado en 0.103.4 · prioridad **baja**.

**Prioridad baja**: hoy no falla en ninguna corrida conocida. Lo sostienen dos textos —la regla y un aviso
en los prompts—, y ya se vio lo que pasa cuando un agente no tiene ninguno de los dos.

**Pedía una decisión del dueño**, y se tomó: una empresa puede querer la firma, así que el guard va con
interruptor.

## Resumen

R8 prohíbe los trailers de IA en un commit, y también en el título, el cuerpo y los comentarios de un PR
(`template/planning/rules/system/commits.md:6` y `:22`). La misma regla dice por qué no alcanza con
recordarlo: la firma «casi nunca es algo que alguien tipea — lo agrega la herramienta, sola».

Ningún guard la comprueba. En `engine/` y `automatization/hooks/` no hay una sola mención de `Co-Authored`
ni de `trailer`: se buscó y dio cero.

## Reproducción

Corrida real con el motor de la rama que después fue 0.103.4, antes de agregar el aviso: los commits de
planning ya iban con `cauce-clerk` y `cauce-scribe`, que no cargan las instrucciones del proyecto.

## Síntoma

Los tres commits que hicieron esos agentes en dos corridas salieron firmados:

```
chore(planning): close resta-dos-numeros
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
```

Ningún guard los frenó. Se vio leyendo `git log` a mano, que es la única forma en que se podía ver.

## Causa raíz

La prohibición es prosa. La cumple el agente que carga las reglas, y el runner agrega su firma por defecto a
quien no las carga. 0.103.4 lo tapó con una frase en los prompts que commitean; 0.103.5 la quitó y volvió a
cargarle las reglas a quien commitea (caso 302), porque una frase del recorrido le ganaba a la empresa que
hubiera decidido otra cosa.

O sea que hoy la sostiene sólo la regla. Un paso nuevo que commitee con un agente sin reglas vuelve a firmar,
y nada se pone rojo.

## Fix propuesto

1. **Un guard que frene un `git commit` cuyo mensaje trae una firma de IA.** Es comprobable sin interpretar:
   un trailer `Co-Authored-By` que nombra un modelo o un asistente, o una línea «Generated with». Decide la
   dirección segura, que es lo que la convención de guards pide.
2. **Un interruptor para la empresa que sí quiere la firma**, declarado en `ops.config.json` junto a
   `runner.commitToLiveBranch`. Por defecto frena; encendido, el guard no opina.
3. **Que R8 diga cómo se enciende**, para que la empresa no tenga que reemplazar la regla entera.
4. **Decidir si alcanza al PR.** R8 cubre título, cuerpo y comentarios. `gh pr create --body` y `gh pr
   comment` tienen el texto en el comando; un cuerpo que viene de un archivo, no.
5. **Mirar qué pasa con los otros runners.** Cada uno tiene su propia firma por defecto, y la lista de qué
   cuenta como firma tiene que salir de lo que agregan de verdad, no de memoria.

## Tradeoffs

- **La lista de firmas es una lista de palabras.** Es de las que frenan y no de las que habilitan, así que
  no contradice la convención; pero queda corta igual: una herramienta nueva firma distinto y pasa.
- **Un coautor humano no se puede frenar.** `Co-Authored-By` con una persona es legítimo, y distinguirla de
  un modelo es mirar el nombre.
- **El interruptor vuelve configurable una regla del sistema.** Hoy una empresa que quiere la firma no la
  puede tener limpiamente: R8 la prohíbe. Abrirlo es una decisión de producto, y obliga a reescribir R8 para
  que diga «salvo que el proyecto lo declare».
- **Sin el interruptor**, la empresa que quiere la firma apaga el guard entero o pelea contra el prompt, que
  es frenar de más.

## La decisión que falta

Si hay empresas que quieren la firma —para dejar constancia de qué commits hizo un agente, o porque su
política lo exige—, el guard va con interruptor y R8 cambia. Si no, el guard frena siempre y R8 queda como
está. No hay un dato que lo resuelva desde acá: es qué producto se quiere.

Y una tercera salida, que es no hacerlo: dejar la regla y el aviso, y aceptar que un paso nuevo con un
agente liviano puede volver a firmar hasta que alguien lea el log.

## Contexto de descubrimiento

La primera corrida real del caso 295 con los commits de planning en el agente de oficina. El arreglo de ese
caso fue el aviso en los prompts; lo que quedó sin tomar es esto.

## Relacionados

- 295 — los agentes livianos, donde se vio.
- 302 — por qué el recorrido ya no lo prohíbe desde el prompt.
- 184 — un guard no decide con una lista de palabras permitidas.
- 294 — la misma asimetría: lo que una herramienta cuidaba y el shell no.

## Cierre

**Resuelto en 0.103.5.** La decisión: guard que frena por defecto, con interruptor para la empresa que quiere
la firma.

### El recorrido de lo que este caso enumeró

- **1, el guard — se hizo.** `ai-signature`, en el grupo de shell. Frena un `git commit` en un repositorio de
  la sesión cuyo mensaje trae un `Co-Authored-By` de un asistente, «Generated with» de un asistente, un
  trailer `Assisted-by` o el enlace a la sesión. Un coautor humano pasa.
- **2, el interruptor — se hizo.** `runner.allowAiSignature: true` en `ops.config.json`.
- **3, R8 — se hizo.** La regla dice que el motor lo comprueba y cómo se enciende. No hace falta reemplazarla
  entera para permitir la firma.
- **4, el pull request — se hizo.** `gh pr|issue create|edit|comment|review` con la firma en su texto.
- **5, los otros runners — se hizo distinto.** No se midió qué firma agrega cada uno: la lista nombra a los
  asistentes por su nombre —el de cada runner incluido— y no por la forma exacta de su firma.
- **Tradeoffs.** El de la lista se paga, y el encabezado del guard dice qué no ve. El del coautor humano se
  resolvió mirando cómo firma la herramienta y no un nombre suelto: abajo.

### Lo que este caso encontró y no preveía

**El mensaje no llega por donde los demás guards leen.** Va casi siempre en un heredoc, y `commandOf` lo
saca porque para ellos es dato. La primera versión leía de ahí y no frenaba nada. Lee el comando crudo.

**Una firma citada en la prosa no es una firma.** Un commit que explica «la corrida agregó "Co-Authored-By:
Claude"» tiene que pasar, así que sólo cuenta la que empieza su línea. La contracara queda declarada y con su
prueba: una firma pasada como un segundo `-m` suelto no se ve.

**Un nombre no alcanza para decir que es un asistente.** La primera versión buscaba «claude», «devin»,
«gemini» en la línea del coautor. Una revisión independiente del diff mostró que frenaba a un Claude Dupont y
a un Devin Smith, y a cualquiera con casilla en la empresa que hace un asistente, y que el mensaje mandaba a
borrarlos sin preguntar. Ahora cuenta el nombre de producto con que la herramienta se presenta —«Claude
Opus», «GitHub Copilot»— o la casilla desde la que firma. Y el mensaje dice que un coautor que es una persona
se queda.

**El comando llega por más de una vía.** El guard decidía con una lectura y buscaba la firma con otra, que
miraba un solo campo: por las demás, el commit firmado pasaba callado.

### Qué se corrió

- **El guard instalado, en un banco**, con el comando entregado como lo entrega el runner:

  ```
  commit firmado por un asistente               exit=2  BLOQUEADO: el mensaje de este 'git commit' trae un Co-Authored-By de un asistente …
  commit con un coautor humano                  exit=0
  commit firmado, con runner.allowAiSignature   exit=0
  ```

- **El texto de un PR, en la prueba y no en el banco.** En una instancia un `gh pr create` lo frena antes el
  guard de publicación, que pide a una persona; la firma se mira cuando ése ya dejó pasar. Los cuatro verbos
  se probaron llamando al guard solo.
- **Nueve mutaciones en rojo, en una copia**: sin el interruptor, juzgando repositorios ajenos, sin mirar
  `gh`, sin `gh pr merge`, leyendo el comando sin su heredoc o por una sola vía, un nombre suelto como
  asistente, la casilla de una empresa entera, y «Generated with» dentro de una frase. La de repositorios
  ajenos sobrevivió la primera vez: su prueba pasaba porque el ejemplo no llevaba una firma de verdad.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: una sesión real cuyo agente firme y sea frenado. Con las reglas cargadas ninguno
  firmó en las corridas de esta versión, que es lo que se busca.
