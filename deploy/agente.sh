#!/usr/bin/env bash
# Instala en el servidor el release que GitHub Actions dejó por FTPS en entrante/
# (tasks/plan-despliegue.md § 2). Lo corre cron cada minuto, un ambiente tras otro:
#
#   * * * * * /bin/bash $HOME/fedal/agente.sh qa; /bin/bash $HOME/fedal/agente.sh prod
#
# Sin entrante/listo no hace nada. Con él: verifica el archivo, instala, respalda la
# base, migra, activa y revisa la salud. Si algo falla, el release anterior sigue activo.
# El resultado queda en entrante/estado, que GitHub Actions lee por FTPS, y el detalle,
# en logs/agente.log.
#
# Corre en bash 3.2 (macOS, para el test) y en el bash de CloudLinux.
set -euo pipefail

ambiente=${1:-}
case "$ambiente" in
  qa)
    docroot="$HOME/public_html/qa.fedal.cl"
    url_salud='https://qa.fedal.cl/api/salud'
    ;;
  prod)
    docroot="$HOME/public_html"
    url_salud='https://fedal.cl/api/salud'
    ;;
  *)
    echo 'Uso: agente.sh qa|prod' >&2
    exit 2
    ;;
esac
url_salud=${AGENTE_URL_SALUD:-$url_salud}
# ponytail: espera fija porque Passenger mira tmp/restart.txt cada PassengerStatThrottleRate
# (10 s por defecto). Si el chequeo llegara a ver el proceso viejo, la salida es que
# /api/salud informe el sha del release.
espera_reinicio=${AGENTE_ESPERA_REINICIO:-15}

base="$HOME/fedal/$ambiente"
entrante="$base/entrante"
releases="$base/releases"
manifiesto="$base/web.manifiesto"

[ -f "$entrante/listo" ] || exit 0

# En cron el PATH es /usr/bin:/bin: el node del Selector no está ahí.
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:$PATH" TZ=UTC LC_ALL=C

# Una corrida por ambiente a la vez, porque un deploy dura más que el minuto del cron.
# flock suelta el candado cuando el proceso muere, así que nunca queda trabado.
exec 9>"$base/.agente.lock"
flock -n 9 || exit 0

mkdir -p "$base/logs"
log="$base/logs/agente.log"
touch "$log"
desde=$(($(wc -l < "$log") + 1))
exec >> "$log" 2>&1

paso() { echo "$(date -u +%FT%TZ) [$ambiente] $*"; }

# "listo" llega por FTP: su contenido decide rutas, así que se valida antes de usarlo.
read -r sha suma < "$entrante/listo" || true
if ! [[ "${sha:-}" =~ ^[0-9a-f]{7,40}$ && "${suma:-}" =~ ^[0-9a-f]{64}$ ]]; then
  invalido="${sha:-}"
  sha=listo-invalido
fi

activado=no
anterior=''

# Escribe entrante/estado de una vez (con mv), para que GitHub Actions nunca lea uno a
# medio escribir, y saca de entrante/ lo que ya se procesó.
terminar() {
  {
    echo "$sha $1"
    if [ "$1" != ok ]; then tail -n +"$desde" "$log" | tail -n 40; fi
  } > "$entrante/estado.tmp"
  mv -f "$entrante/estado.tmp" "$entrante/estado"
  rm -f "$entrante/listo" "$entrante/release-$sha.tar.gz"
}

# Copia la web del release al document root y borra solo lo que puso el release
# anterior y este ya no trae. Lo que el agente no puso no lo toca nunca: la carpeta de
# QA dentro de public_html, el api/.htaccess del Selector, .well-known/, cgi-bin/.
publicar_web() {
  local web="$1/web" nuevo
  [ -d "$web" ] || return 0
  cp "$1/deploy/htaccess.$ambiente" "$web/.htaccess"
  nuevo=$(mktemp)
  (cd "$web" && find . -type f | sort) > "$nuevo"
  mkdir -p "$docroot"
  cp -R "$web/." "$docroot/"
  if [ -f "$manifiesto" ]; then
    comm -23 "$manifiesto" "$nuevo" | while IFS= read -r archivo; do
      rm -f "$docroot/$archivo"
    done
  fi
  mv -f "$nuevo" "$manifiesto"
}

reiniciar() {
  mkdir -p "$base/tmp"
  touch "$base/tmp/restart.txt"
}

# La clave de la base sale de DATABASE_URL y va a un archivo temporal de opciones, no a
# la línea de comandos, donde la vería cualquiera con ps.
respaldar() {
  local opciones destino db
  mkdir -p "$base/respaldos"
  opciones=$(mktemp)
  destino="$base/respaldos/$(date -u +%Y%m%dT%H%M%SZ)-$sha.sql.gz"
  # shellcheck disable=SC2016  # es JavaScript: los ${} son de sus template literals
  db=$(node -e '
    process.loadEnvFile(process.argv[1]);
    const url = new URL(process.env.DATABASE_URL);
    const d = decodeURIComponent;
    require("node:fs").writeFileSync(process.argv[2], [
      "[client]",
      `user="${d(url.username)}"`,
      `password="${d(url.password)}"`,
      `host="${url.hostname}"`,
      `port=${url.port || 3306}`,
    ].join("\n") + "\n");
    console.log(url.pathname.slice(1));
  ' "$base/.env" "$opciones")
  # El dump trae los datos personales de los socios: se crea legible solo por la cuenta,
  # antes de escribir una línea. El > de abajo lo trunca sin cambiarle el modo.
  : > "$destino"
  chmod 600 "$destino"
  if ! mysqldump --defaults-extra-file="$opciones" --single-transaction --no-tablespaces \
    "$db" | gzip > "$destino"; then
    rm -f "$opciones" "$destino"
    return 1
  fi
  rm -f "$opciones"
  # shellcheck disable=SC2012  # nombres que pone el agente: fecha y sha, sin espacios
  ls -1t "$base/respaldos" | tail -n +11 | while IFS= read -r viejo; do
    rm -f "$base/respaldos/$viejo"
  done
}

salud() {
  local opciones=(-fsS --max-time 30) intento
  if [ -f "$base/salud.netrc" ]; then opciones+=(--netrc-file "$base/salud.netrc"); fi
  for intento in 1 2 3 4 5; do
    sleep "$espera_reinicio"
    if curl "${opciones[@]}" "$url_salud"; then return 0; fi
    paso "salud: intento $intento de 5 sin respuesta sana de $url_salud"
  done
  return 1
}

# Deja de nuevo activo el release anterior: API y web.
volver_atras() {
  paso "volviendo a $anterior"
  ln -sfn "$anterior" "$base/current"
  publicar_web "$base/$anterior"
  reiniciar
}

# Cualquier salida con error pasa por acá, venga de un paso que falló (set -e) o de una
# verificación que no pasó.
al_salir() {
  local codigo=$?
  [ "$codigo" -eq 0 ] && return
  set +e
  paso "error: el release $sha no quedó activo"
  if [ "$activado" = si ] && [ -n "$anterior" ]; then volver_atras; fi
  terminar error
}
trap al_salir EXIT

if [ "$sha" = listo-invalido ]; then
  paso "listo trae un sha o un sha256 que no son válidos: '$invalido'"
  exit 1
fi

archivo="$entrante/release-$sha.tar.gz"
paso "release $sha: verificando el archivo"
if [ ! -f "$archivo" ]; then
  paso "no está $archivo"
  exit 1
fi
if [ "$(sha256sum "$archivo" | cut -d' ' -f1)" != "$suma" ]; then
  paso 'el sha256 no coincide: el archivo llegó incompleto o dañado'
  exit 1
fi

rel="$releases/$sha"
rm -rf "$rel"
mkdir -p "$rel"
tar -xzf "$archivo" -C "$rel"
ln -sfn "$base/.env" "$rel/apps/api/.env"
cd "$rel"

paso 'instalando dependencias'
npm ci --omit=dev -w apps/api --no-audit --no-fund

paso 'respaldando la base'
respaldar

paso 'migrando'
npm exec --no -w apps/api -- prisma migrate deploy

paso 'arranque'
admin="$base/admin-inicial.env"
[ -f "$admin" ] || admin=''
ADMIN_INICIAL="$admin" npm run arranque --if-present -w apps/api
# El admin ya quedó creado: su clave no se queda en disco.
[ -z "$admin" ] || rm -f "$admin"

paso 'activando'
anterior=$(readlink "$base/current" || true)
if [ -d "$base/current" ] && [ ! -L "$base/current" ]; then
  # La primera vez, current es la carpeta del archivo de prueba del Selector. Pasa a ser
  # un release más, para tener a qué volver. ln -sfn sobre una carpeta crearía el enlace
  # adentro en vez de reemplazarla.
  rm -rf "$releases/inicial"
  mv "$base/current" "$releases/inicial"
  anterior=releases/inicial
fi
activado=si
ln -sfn "releases/$sha" "$base/current"
publicar_web "$rel"
reiniciar

paso 'revisando la salud'
salud

# Lo que sigue ya no justifica volver atrás un release sano.
activado=no
# shellcheck disable=SC2012  # nombres que pone el agente: shas hexadecimales e "inicial"
ls -1t "$releases" | tail -n +4 | while IFS= read -r viejo; do
  [ "releases/$viejo" = "$(readlink "$base/current")" ] || rm -rf "${releases:?}/$viejo"
done
# cp a un temporal y mv encima: el bash que está corriendo este archivo lo sigue leyendo
# del inodo viejo, así que reemplazarlo a media corrida no lo rompe.
if ! { cp "$rel/deploy/agente.sh" "$HOME/fedal/agente.sh.nuevo" &&
  mv -f "$HOME/fedal/agente.sh.nuevo" "$HOME/fedal/agente.sh"; }; then
  paso 'aviso: no se pudo actualizar el agente'
fi

paso "release $sha activo"
terminar ok
