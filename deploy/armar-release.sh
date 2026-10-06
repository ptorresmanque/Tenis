#!/usr/bin/env bash
# Arma el release que instala el agente del servidor (tasks/plan-despliegue.md § 2):
# un .tar.gz con lo justo para levantar la API y servir la web, más "listo", que dice
# qué commit trae y con qué sha256 llega entero.
#
#   deploy/armar-release.sh  →  dist/release/release-<sha>.tar.gz y dist/release/listo
#
# Corre igual en macOS (bash 3.2, bsdtar) y en Ubuntu (bash 5, tar GNU).
set -euo pipefail

cd "$(dirname "$0")/.."

# El release lleva el sha de un commit. Con cambios sin commitear, el código que sube no
# es el de ese sha, y volver atrás o rastrear un error pasa a ser adivinanza.
if [ -n "$(git status --porcelain)" ]; then
  echo 'Hay cambios sin commitear: el release se arma desde un commit limpio.' >&2
  exit 1
fi

sha=$(git rev-parse --short=12 HEAD)
armado=$(mktemp -d)
trap 'rm -rf "$armado"' EXIT

# Antes del build: si falla, no queda un release anterior que parezca el de este commit.
salida=dist/release
rm -rf "$salida"

npm run build

# Lista blanca: lo que no se nombra acá no viaja. Sin node_modules, que el agente
# instala en el servidor porque sharp, argon2 y el engine de Prisma son binarios de
# cada plataforma. Sin src ni tests, y sin el seed de demostración, que no debe correr
# nunca fuera de desarrollo.
mkdir -p "$armado/apps/api/prisma" "$armado/apps/web"
cp package.json package-lock.json "$armado/"
cp apps/api/package.json apps/api/prisma.config.ts "$armado/apps/api/"
cp -R apps/api/dist "$armado/apps/api/"
cp apps/api/prisma/schema.prisma "$armado/apps/api/prisma/"
cp -R apps/api/prisma/migrations "$armado/apps/api/prisma/"
# npm ci exige que el lockfile calce con todos los workspaces, también con el de la web.
cp apps/web/package.json "$armado/apps/web/"
cp -R apps/web/dist/web/browser "$armado/web"
cp -R deploy "$armado/"
find "$armado/deploy" -name '*.test.*' -delete

mkdir -p "$salida"
archivo="$salida/release-$sha.tar.gz"

# El tar de macOS agrega archivos ._ y atributos extendidos que el tar GNU del servidor
# no entiende. Las opciones para no guardarlos solo existen en bsdtar.
export COPYFILE_DISABLE=1
case "$(tar --version)" in
  *bsdtar*) sin_metadatos='--no-mac-metadata --no-xattrs' ;;
  *) sin_metadatos='' ;;
esac
# shellcheck disable=SC2086  # $sin_metadatos son dos opciones o ninguna
tar $sin_metadatos -czf "$archivo" -C "$armado" .

# "listo" se sube al final: el agente no toca un release hasta verlo, y por el sha256
# sabe si el .tar.gz llegó entero.
suma=$(sha256sum "$archivo")
echo "$sha ${suma%% *}" > "$salida/listo"

echo "$archivo"
