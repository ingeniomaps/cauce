---
caso: 245
titulo: aplicar una propuesta no crea el caso que trae firmado, porque lee «no se crea el archivo» como prohibición
estado: resuelto
resuelto-en: 0.100.0
prioridad: media
version-detectada: 0.100.0
---

# 245 — Aplicar una propuesta no crea el caso que trae firmado

**🟢 resuelto en 0.100.0** · detectado en 0.100.0 · prioridad **media**.

**Prioridad media**: un caso firmado queda fuera del cargo sin que nada lo diga en la puerta, y la conducta que
debía medir queda sin medir hasta que alguien lo note.

## Resumen

`agent-propose` le pide a quien redacta que enuncie el caso que haga falta y que **no cree el archivo**, porque
cambiar lo que se mide es parte de lo que se firma. Quien redacta copia esa instrucción en la propuesta («No se
crea el archivo»). Al aplicar, `agent-promote` crea el caso si la propuesta lo pide, pero lee esa frase al pie
de la letra y no lo crea. Es el inverso del caso 244: allá entraba un caso sin firma, y acá se queda afuera uno
firmado.

## Reproducción

`/agent-promote logistics-operations-manager` y `/agent-promote release-manager` sobre sus propuestas de
2026-10, que traen enunciados de casos en «Evaluación» bajo un título que dice «No se crea el archivo».

## Síntoma

Las dos aplicaciones lo anotaron como desviación y no crearon los casos. De `release-manager`:

```
- **Casos `11-provenance-without-isolation-level` y `12-canary-historical-baseline`: no se crearon**, como
  la propia propuesta indica («se escribe el enunciado, no se crea el archivo»).
```

Las otras aplicaciones del mismo día, con frases parecidas, sí los crearon: depende de cómo lea el agente.

## Causa raíz

- `automatization/workflows/agent-propose.js`, fase «Proponer»: «escribí el enunciado del caso que haría falta
  […] y **no crees el archivo**».
- `automatization/workflows/agent-promote.js`, fase «Aplicar»: «Si la propuesta pide crear un caso adversarial
  nuevo, crealo con el enunciado que da». No dice qué hacer con un enunciado que la propuesta marca como «no se
  crea».

## Fix propuesto

En `agent-promote`: un caso enunciado en la propuesta firmada se crea con su enunciado literal, aunque la
propuesta diga que no se crea el archivo. Esa frase se refiere a cuando se redactó, y el caso entra con la
firma. Es la lectura que se decidió el 2026-10-02 con el caso 15 de `qa-engineer`.

## Tradeoffs

Ninguno de fondo: es la lectura que ya se aplicaba a mano.

## Contexto de descubrimiento

Al revisar las 46 aplicaciones de 2026-10, después de arreglar el 244. Los casos de esas dos aplicaciones se
crearon a mano desde el enunciado (PR #710 y #711).

## Relacionados

- **244**: el inverso, un caso sin firma que entraba.

## Cierre

**🟢 resuelto en 0.100.0** · `automatization/workflows/agent-promote.js`, `automatization/workflows/agent-propose.js`,
`test/workflows/workflows-eval.test.js`.

### La prueba

Se armó un banco en `c635aa6`, el estado de `main` justo antes de aplicar las propuestas de conducta (#710): ahí
la propuesta de `logistics-operations-manager` está firmada y sin aplicar, dice «No se crea el archivo» y el caso
08 no existe. Sobre ese banco se corrió `/agent-promote logistics-operations-manager` con el recorrido arreglado:

```
exit=0 t=242s
08-evento-mal-emitido.md
status: applied
```

El caso que creó es idéntico, byte por byte, al que se había creado a mano desde el enunciado firmado (`diff`
vacío). El rojo previo es la aplicación del 2026-10-02 sobre la misma propuesta, que no lo creó. La prueba nueva
se vio en rojo quitando la frase de `agent-promote` y, por separado, restaurando el «**no crees el archivo**» de
`agent-propose`.

### Contra lo que el caso enumeró

- **`agent-promote` crea el caso enunciado aunque la propuesta diga que no se crea** — **se hizo**, y es lo
  que muestra el banco.
- **Del lado de quien redacta** — **se hizo además**, aunque el fix propuesto no lo pedía: `agent-propose` dice
  ahora que el caso lo crea quien aplique y pide no escribir en la propuesta que el archivo no se crea. Arreglar
  sólo la lectura dejaba la frase en todas las propuestas futuras. Se ve recién en las propuestas de 2026-11.
- **Tradeoffs** — no había.

