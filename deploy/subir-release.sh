#!/usr/bin/env bash
# Sube por FTPS el release que armó deploy/armar-release.sh y espera lo que diga el agente
# del servidor (tasks/plan-despliegue.md § 2, D7). Lo corre GitHub Actions, con las
# credenciales del environment del ambiente:
#
#   FTP_HOST=… FTP_USUARIO=… FTP_CLAVE=… deploy/subir-release.sh
#
# FTP_HOST es el nombre del servidor y no el del dominio: el certificado del FTP es de
# *.pymedns.net, y con otro nombre curl rechaza la conexión. Bien rechazada: sin verificar
# el certificado, la clave quedaría expuesta a quien se pusiera en el medio.
#
# Sale con 0 si el agente activó el release, y con 1 si no lo activó o si no respondió a
# tiempo. Corre en bash 3.2 (macOS, para el test) y en el de Ubuntu.
set -euo pipefail

cd "$(dirname "$0")/.."

: "${FTP_HOST:?Falta FTP_HOST}" "${FTP_USUARIO:?Falta FTP_USUARIO}" "${FTP_CLAVE:?Falta FTP_CLAVE}"
intervalo=${SUBIR_INTERVALO:-20}
# El cron pasa cada minuto, y una instalación con dependencias nuevas tarda unos minutos.
espera_max=${SUBIR_ESPERA_MAX:-900}

read -r sha _ < dist/release/listo
archivo="dist/release/release-$sha.tar.gz"
if [ ! -f "$archivo" ]; then
  echo "No está $archivo: antes hay que correr deploy/armar-release.sh." >&2
  exit 1
fi

# La clave va en un netrc temporal y no en la línea de comandos, donde se vería con ps.
netrc=$(mktemp)
trap 'rm -f "$netrc"' EXIT
printf 'machine %s login %s password %s\n' "$FTP_HOST" "$FTP_USUARIO" "$FTP_CLAVE" > "$netrc"

ftps() { curl -sS --ssl-reqd --netrc-file "$netrc" "$@"; }
servidor="ftp://$FTP_HOST"

echo "Subiendo el release $sha"
# Primero se borra el estado anterior (el * hace que no falle si no hay). Al volver a
# desplegar el mismo sha, que es como se vuelve atrás, el viejo ya lo nombra: leerlo daría
# por activo, o por fallido, un release que el agente todavía no toca.
ftps -Q '*DELE estado' -T "$archivo" "$servidor/"
# "listo" va al final y aparece de una vez: se sube con otro nombre y después se renombra,
# así el agente nunca lo lee a medio escribir.
ftps -T dist/release/listo "$servidor/listo.tmp" -Q '-RNFR listo.tmp' -Q '-RNTO listo'

echo "Esperando al agente, que pasa cada minuto"
inicio=$(date +%s)
while :; do
  # Puede no existir todavía, o traer el resultado de un release anterior.
  estado=$(ftps "$servidor/estado" 2> /dev/null || true)
  case "$(printf '%s\n' "$estado" | head -n 1)" in
    "$sha ok")
      echo "Release $sha activo."
      exit 0
      ;;
    "$sha error")
      printf '%s\n' "$estado" >&2
      echo "El agente no activó $sha: el release anterior sigue activo." >&2
      exit 1
      ;;
  esac
  if [ $(($(date +%s) - inicio)) -ge "$espera_max" ]; then
    echo "El agente no respondió en $espera_max s. ¿Sigue el cron en cPanel?" >&2
    exit 1
  fi
  sleep "$intervalo"
done
