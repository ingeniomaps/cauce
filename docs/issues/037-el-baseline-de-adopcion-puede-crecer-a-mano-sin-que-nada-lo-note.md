---
caso: 037
titulo: El baseline de adopción puede crecer a mano y nada lo distingue de haberse generado así
estado: resuelto
resuelto-en: 0.65.0
prioridad: media
version-detectada: 0.64.0
---

# 037 — La lista de perdones no admite entradas nuevas, y nada lo comprueba

**🟢 resuelto en 0.65.0** · detectado en 0.64.0 · prioridad **media** — la propiedad está enunciada y no tiene mecanismo

## Resumen

`ops adopt` genera `planning/.adoption-baseline` una vez, con las entradas de `DONE.md` que no cumplen
el contrato de evidencia, y se niega a regenerarlo. El caso que lo pidió
—[021](021-no-hay-forma-de-adoptar-una-historia-anterior.md)— enumeró tres propiedades y **salieron
dos**. La tercera dice que la lista no admite entradas nuevas, y no hay nada que lo comprueba: agregar
un slug a mano perdona esa entrada para siempre y no deja ninguna señal.

El caso lo dejó registrado como dimensión sin cubrir, con lo que la cerraría: «una forma barata y
confiable de fechar una entrada de DONE». Ese planteo es lo que hay que corregir — la pregunta no es
cuándo se escribió la entrada.

## Reproducción

```bash
mkdir repo && cd repo && git init -q .
npx @ingeniomaps/cauce@0.64.0 init ops --mode sidecar --install

cat >> ops/planning/DONE.md <<'EOF'

## Hito viejo — Antes de la adopción

- [x] **vieja** — Lo que se construyó entonces.
  done: lo único que aquel proceso registraba
EOF
node ops/tools/ops.js adopt ops/planning      # genera el baseline con `vieja`

# Ahora una entrada nueva, escrita bajo el contrato completo y a medias a propósito:
cat >> ops/planning/DONE.md <<'EOF'
- [x] **nueva** — Trabajo de hoy.
  done: a medias
EOF
echo nueva >> ops/planning/.adoption-baseline

node ops/tools/ops.js check ops/planning      # verde: perdona `nueva` como si fuera historia
```

## Síntoma

`check` no distingue el slug que `adopt` escribió del que alguien agregó después. Lo único que dice es
la cuenta:

```
⚠ .adoption-baseline: 2 entrada(s) exenta(s) del contrato de evidencia por adopción
```

Dos, cuando la adopción perdonó una. La cuenta sube y nadie sabe que subió.

## Causa raíz

`engine/planning/adoption.js`: el lector devuelve los slugs y nada más. No hay ningún dato en el archivo
contra el cual contrastar su contenido, así que «lo que se generó» y «lo que hay» son indistinguibles.

Y el planteo que dejó el 021 lleva a un callejón: fechar una entrada de `DONE.md` exige `git blame`
sobre un archivo que un proyecto recién adoptado pudo haber reescrito entero, o sea caro y poco
confiable justo donde haría falta.

**La pregunta correcta es otra.** No hace falta saber cuándo se escribió la entrada, sino si el slug
estaba en la lista cuando `adopt` la generó. Eso lo puede contestar el propio archivo.

## Fix propuesto

Que `adopt` firme lo que generó, en la misma cabecera que ya escribe:

```
# Entradas anteriores a la adopción de Cauce (2026-09-06). No se agregan nuevas.
# huella: 12 entradas · sha256:3f9a…
tarea-de-2024
otra-tarea-vieja
```

y que `check` recalcule la huella sobre las líneas que no son comentario. Si no coincide, la lista
creció o se editó después de generarse, y eso se dice con nombre propio en vez de contarse.

Tres propiedades que conviene conservar:

- **Achicarla no puede ser un error.** Borrar el renglón de una entrada que ya cumple es el camino que
  `check` mismo recomienda hoy, así que la huella tiene que distinguir «creció» de «se achicó», o el
  aviso de una cosa contradice al de la otra.
- **Sin git.** La comprobación es aritmética sobre el archivo: funciona en un clon superficial, sin
  `git` en el PATH y con el `DONE.md` reescrito.
- **Advertencia, no error.** Igual que el resto de lo que rodea al baseline: la adopción es legítima y
  lo que no puede es esconderse.

## Tradeoffs

Una huella en la cabecera es un dato que hay que mantener: si alguien edita el archivo con una
herramienta que reordena líneas, salta sin que nadie haya hecho nada malo. Se acota calculándola sobre
el conjunto ordenado de slugs y no sobre el texto, que además es lo que hace que achicar sea detectable
como achicar.

Y no impide nada: quien quiera agrandar la lista puede recalcular la huella. Eso está bien — el punto no
es cerrar la puerta con llave sino que abrirla deje marca, que es la diferencia entre una exención y un
descuido.

## Prioridad

**Media.** No hay riesgo silencioso para quien no toque el archivo, y el baseline vive commiteado, así
que un diff lo muestra. Pero esta sesión aprendió varias veces que «el review lo va a ver» es lo que
falla, y una lista de perdones que crece es exactamente lo que nadie relee.

## Contexto de descubrimiento

Contrastando los casos cerrados contra lo que de verdad se construyó, el 2026-09-06, después de que el
mismo ejercicio encontrara dos desacuerdos en 021 y 027. La propiedad quedó anotada en el 021 como
dimensión sin cubrir; al volver sobre ella para decidir si valía la pena, apareció que el planteo que
tenía escrito —fechar la entrada— no era la pregunta.

## Cierre

**🟢 resuelto en 0.65.0.** Lo que este caso enumeró, ítem por ítem:

- **Que `adopt` firme lo que generó y `check` recalcule** → hecho: `# huella: N entradas · sha256:…`.
- **Achicarla no puede ser un error** → resuelto, y cambiando el planteo: retirar un renglón pasa a
  marcarse con `#~` en vez de borrarlo. Con el borrado, la huella no podía distinguir «creció» de «se
  achicó» sin guardar el conjunto original, que es el archivo mismo. El precio, dicho: la lista nunca
  se acorta.
- **Sin git** → hecho: es aritmética sobre el archivo.
- **Advertencia, no error** → hecho.
- **El tradeoff de reordenar** → cubierto: la huella va sobre el conjunto ordenado, con su caso.
- **Lo que este caso no previó**: un baseline generado antes de que la huella existiera. `check` lo dice
  y `adopt` lo sella sin regenerar la lista, que es la única salida que ese aviso podía tener.

## Relacionados

- [021](021-no-hay-forma-de-adoptar-una-historia-anterior.md) — de donde sale. Ahí está registrada como
  la tercera propiedad que no se implementó; acá está con un camino que no depende de git.
