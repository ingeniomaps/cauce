---
caso: 223
titulo: install no preserva los hooks ni los workflows propios de una instancia
estado: abierto
prioridad: media
version-detectada: 0.99.2
---

# 223 — Una instancia que agrega hooks o workflows propios tiene que protegerlos de su propio `install`

**🔴 abierto** · detectado en 0.99.2 · prioridad **media**.

**Prioridad media**: una defensa propia desaparece en silencio. La reproducción está pendiente: lo que sigue sale de los commits de roax-ops y hay que comprobarlo contra el `install` de `main`.

## Resumen

roax-ops agrega guards y workflows propios junto a los de Cauce. Dos commits dicen que el camino de instalación no los conoce: en `0ca7f7d`, reinstalar se llevó de la configuración activa el guard de ADF del PR #41; en `8f0705b`, sus workflows necesitan un marcador propio (`{{SERVERS_ROOT}}`) que reemplazan con `sed`, porque `{{OPS_ROOT}}` sólo se resuelve en los workflows de Cauce.

## Reproducción

Pendiente de correr al tomar el caso, en un banco instalado: agregar un hook propio a `.claude/settings.json` y un workflow propio en `automatization/workflows/`, correr `automation install` y ver qué queda de cada uno. El caso 218 ya cambió cómo `install` trata los hooks ajenos (`foreignHooks`), así que puede que una parte esté resuelta.

## Síntoma

En roax el guard de ADF dejó de correr sin que nada lo dijera.

## Causa raíz

A establecer contra `engine/automation/index.js`: qué hace `install` con entradas de `settings.json` que no son de Cauce y si renderiza workflows de la instancia.

## Fix propuesto

Un contrato para lo propio: una carpeta o un prefijo que `install` preserva y renderiza con los mismos marcadores. Se decide después de reproducir.

## Tradeoffs

- Renderizar lo propio con los marcadores de Cauce los vuelve parte de la API: hay que decir cuáles son estables.

## Contexto de descubrimiento

Relevamiento de roax-ops y conorbi-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala.

## Relacionados

- 218 — `install` y los hooks ajenos.
- 229 — un guard propio de roax que se perdió así.
