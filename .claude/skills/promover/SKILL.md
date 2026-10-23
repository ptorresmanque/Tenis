---
name: promover
description: Promueve qa a main (PR con lo aprobado en qa.fedal.cl y la lista de /ship) y, después del merge, mueve el tag trabajo-de-titulo. Úsalo con /promover para abrir la promoción y con /promover tag cuando ya se fusionó.
argument-hint: "[tag]"
disable-model-invocation: true
---

# Promover qa a main

A `main` solo llega la promoción: un PR de `qa` hacia `main` con lo que el cliente ya aprobó
en qa.fedal.cl. Cada merge en `main` sale a fedal.cl en unos 10 minutos (CLAUDE.md, «Ramas y
despliegue»). Este skill tiene dos fases. Si `$ARGUMENTS` es `tag`, salta a la Fase B.

Los scripts están en `.claude/skills/promover/scripts/`.

## Fase A: abrir la promoción

1. `git fetch origin --tags`.
2. **Qué lleva:** `bash .claude/skills/promover/scripts/prs-incluidos.sh`. Lista los PR
   fusionados en `qa` que todavía no están en `main`. Si no sale ninguno, no hay nada que
   promover: detente y dilo. Una urgencia que salió a `main` y después se llevó a `qa` por PR
   aparece en la lista aunque ya esté en producción: crúzala con `git log origin/main` y
   déjala fuera de «Qué llega a fedal.cl».
3. **Nada de la tienda:** `bash .claude/skills/promover/scripts/revisar-tienda.sh origin/main origin/qa`.
   Con cualquier salida distinta de 0, **detente y pregúntale al usuario**: 1 es que entra
   código de la tienda (Etapa 2, fuera de la tesis, oculta tras `TIENDA_HABILITADA` hasta que
   el club la apruebe), y 2 es que no se pudo revisar.
4. **Lo que cambia en producción:** revisa `git diff --stat origin/main...origin/qa` y anota
   si trae migraciones (`apps/api/prisma/migrations/`), cambios en la API, variables de
   entorno nuevas o cambios en `deploy/` y los `.htaccess`. Si trae migraciones, lanza el
   subagente `revisor-de-migraciones` sobre ese rango.
5. **`/ship`:** invoca el skill `shipping-and-launch` sobre el árbol de `origin/qa`, en un
   worktree aparte y no en la carpeta principal, que pueden estar usando otras sesiones:
   `git worktree add --detach .claude/worktrees/promocion origin/qa`, después `npm ci` ahí
   dentro y `cp apps/api/.env .claude/worktrees/promocion/apps/api/.env` (las pruebas de la
   API lo cargan con `--env-file`). Calidad (pruebas, lint,
   build con la verificación del prerender, `deploy/*.test.mjs`), seguridad
   (`npm audit --omit=dev`), rendimiento y accesibilidad si algo de eso cambió.
6. **El PR**, con el formato de las promociones anteriores (mira el cuerpo del #157 con
   `gh pr view 157`):
   - Título: `Promoción a producción: <lo principal, en palabras del club> (#<primero>–#<último>)`.
   - `## Promoción de qa a producción: del #a al #b`, y una línea con cuántos PR son, cada
     uno con su `/review` y `compuertas` en verde.
   - `### Qué llega a fedal.cl`: agrupado por tema, con los PR entre paréntesis.
   - `### Qué no trae`: migraciones, API o variables, si no trae, y siempre «Nada de la tienda (Etapa 2)».
   - `### Lista de lanzamiento (/ship, skill shipping-and-launch)`: lo que se midió en el paso 5.
   - `### Volver atrás`: reejecutar el deploy anterior o `git revert -m 1 <merge>` por PR. Si
     hay migraciones, qué SQL las deshace.
   - `### Después del merge`: qué revisar en fedal.cl y si el tag `trabajo-de-titulo` se mueve
     (ver Fase B).
7. Muéstrale al usuario el título y el cuerpo, y **espera su visto bueno** antes de
   `gh pr create --base main --head qa`. No lo fusiones: eso lo decide el usuario.
8. Borra el worktree del paso 5 (`git worktree remove .claude/worktrees/promocion`).

## Fase B: mover el tag (`/promover tag`)

El tag anotado `trabajo-de-titulo` marca la versión vigente de la tesis. Una corrección de la
tesis **mueve el tag**, sin crear uno nuevo, cuando llega a `main` por la promoción, y queda
sobre ese merge.

1. `git fetch origin --tags --force`. Toma el SHA del merge de la promoción
   (`MERGE=$(gh pr view <número> --json mergeCommit -q .mergeCommit.oid)`) y comprueba que
   está en `origin/main` (`git merge-base --is-ancestor $MERGE origin/main`). El tag va sobre
   ese merge y no sobre `origin/main`, que puede tener una urgencia encima. Anota también
   dónde está hoy el tag: `ANTES=$(git rev-parse refs/tags/trabajo-de-titulo)`.
2. **Nada de la tienda:** `bash .claude/skills/promover/scripts/revisar-tienda.sh trabajo-de-titulo $MERGE`.
   Con cualquier salida distinta de 0, **no muevas el tag**: pregúntale al usuario.
3. **Qué entra a la tesis lo decide el usuario.** Lista los PR que trajo la promoción con
   `bash .claude/skills/promover/scripts/prs-incluidos.sh trabajo-de-titulo $MERGE^2`. El `^2`
   es el lado de `qa` del merge; sobre `main` solo se verían las promociones. Pregúntale
   cuáles son correcciones de la tesis. Si ninguno lo es, el tag no se mueve.
4. Lee el mensaje actual (`git tag -l --format='%(contents)' trabajo-de-titulo`) y agrega una
   línea antes del párrafo final («Lo que viene después, empezando por la tienda en línea…»),
   con el mismo formato que las anteriores:
   `- AAAA-MM-DD: <las correcciones, en palabras del club> (#a a #b, promovido en #<merge>).`
5. `git tag -fa trabajo-de-titulo $MERGE -F -` con el mensaje completo.
6. Muéstrale al usuario el commit y el mensaje, y **espera su visto bueno** antes de
   `git push --force-with-lease=refs/tags/trabajo-de-titulo:$ANTES origin refs/tags/trabajo-de-titulo`.
   El `--force-with-lease` evita pisar un movimiento hecho desde otro clone. Los otros clones
   lo traen con `git fetch --tags --force`.
7. Actualiza la memoria `tag-trabajo-de-titulo` con el commit, el PR y la fecha nuevos.
