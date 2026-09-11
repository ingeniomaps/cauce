---
caso: 092
titulo: El guard de secretos sólo mira escrituras, y decide por el nombre del archivo
estado: abierto
prioridad: baja
version-detectada: 0.79.0
---

# 092 — Ningún runner le pasa una lectura a un guard, así que una credencial en disco se lee sin freno

**🔴 abierto** · detectado en 0.79.0 · prioridad **baja** — el guard hace lo que su propósito declara;
lo que falta es una decisión de alcance. Sube a **media** si se adopta el 088 y las identidades de
máquina de una empresa pasan a vivir en archivos que Cauce conoce por nombre

## Resumen

El guard `secrets` se declara como *«Bloquea escribir secretos, claves privadas y credenciales en texto
plano»* (`engine/hooks/run.js:95`), y eso hace: frena Write y Edit sobre archivos cuyo **nombre** parece
de credenciales. No hay guard que mire lecturas. Un `.env.infisical` con la identidad de máquina de una
empresa entra al contexto del agente con un `Read` o un `cat`, y desde ahí a los transcripts.

Es un caso de alcance, no un fallo: nadie prometió frenar lecturas. Se registra porque el 088 lo daba
por existente —«hoy frena Edit/Write y no lecturas por shell»— y la afirmación exacta es más amplia: no
frena lecturas por ninguna herramienta.

## Reproducción

Desde un checkout de Cauce:

```bash
grep -rn '"matcher"' automatization/runners/*/settings.json automatization/runners/*/hooks.json
node -e "console.log(require('./engine/hooks/run').hookGroups)"
```

## Síntoma

Los matchers de los cuatro runners, leídos el 2026-09-10 sobre 0.79.0:

| runner | shell | archivos |
|---|---|---|
| Claude | `Bash` | `Edit\|Write` |
| Codex | `Bash` | `apply_patch\|Edit\|Write` |
| Gemini | `run_shell_command` | `replace\|write_file` |
| Antigravity | `run_command` | `write_to_file\|replace_file_content\|multi_replace_file_content` |

Ninguno enruta una herramienta de lectura. Y el grupo de shell (`run.js:55`: `destructive`, `git-add`,
`dependencies`, `governance`, `verify`, `shell-boundary`) no tiene ningún guard que juzgue lo que un
comando lee. No se corrió una lectura real contra una credencial: lo que consta es que no hay ningún
camino por el que el guard la vea.

## Causa raíz

- **Alcance:** `secrets` está en el grupo `pre-files` (`run.js:56`), que los runners sólo invocan en
  escrituras.
- **Heurística:** decide por `basename` (`engine/hooks/files.js:53-70`): `.env` y `.env.<algo>` salvo
  `.example|.sample|.template|.schema|.dist|.tpl`, una lista de nombres de credenciales y los archivos
  que mantiene una herramienta (`.npmrc`, `id_rsa`, `credentials`…). El propio comentario lo dice:
  *«La forma de decidir sigue siendo el nombre del archivo, así que otro formato pasa igual»*. Corrido el
  2026-09-10 contra el guard, escribiendo con contenido `A=1`:

  ```
  FRENA .env.infisical — /tmp/x/.env.infisical parece contener secretos. …
  PASA  .env.infisical.example
  PASA  local-dev.env
  PASA  identidad-ci.json
  ```

  `local-dev.env` es el nombre que el 088 propone para una identidad de máquina, y hoy pasa: no empieza
  con `.env`. Ni siquiera la escritura de esa credencial está cubierta.

## Fix propuesto

Tres piezas, y la tercera depende del 088:

1. **Lecturas por herramienta de lectura.** Un guard `secrets-read`, con el mismo criterio de nombres, en
   el matcher de lectura de cada runner (`Read` en Claude; los demás, a verificar en su adaptador).
2. **Lecturas por shell, con alcance declarado.** Un comando lee de mil formas —`cat`, `less`, `grep`,
   `source`, un programa que lo abre por dentro—, así que esto es de mejor esfuerzo: frenar los lectores
   obvios sobre los nombres de la lista y decir en el propósito del guard que no es una frontera de
   seguridad. Un guard que se presenta como más fuerte de lo que es enseña a no creerle (R10).
3. **Nombres declarados en vez de adivinados.** Si el 088 da una declaración con las rutas de las
   identidades, el guard las lee de ahí además de la heurística.

## Tradeoffs

- **Frenar la lectura de `.env` rompe trabajo legítimo**: diagnosticar una variable mal cargada empieza
  por mirarla. La salida angosta de siempre —aprobar la ruta en `.ops-approval`— vale acá igual.
- **La pieza 2 nunca va a ser completa**, y eso tiene que estar en el mensaje y en el propósito, no sólo
  en este caso.
- **Algunos runners pueden tener reglas de denegación propias** para lecturas. Es hipótesis: no se
  verificó en la documentación de ninguno. Si existen, la pieza 1 podría ser configuración del runner
  instalada por `automation install` en vez de un guard, y conviene comprobarlo antes de escribirlo.

## Contexto de descubrimiento

2026-09-10, al revisar el 088, que proponía que el guard leyera de la declaración de secretos las rutas
de credenciales y frenara su lectura, «además de la escritura». Se separó porque se decide sin el 088:
la heurística de nombres ya existe, y extenderla a lecturas es una pregunta propia.

## Relacionados

- **088** — la declaración que le daría al guard nombres en vez de patrones.
- **R10** — decir qué comprueba un guard y qué no es parte del guard.
