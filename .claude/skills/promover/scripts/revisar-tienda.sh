#!/usr/bin/env bash
# ¿Entra algo de la tienda en línea (Etapa 2, fuera de la tesis) entre dos puntos?
# Uso: revisar-tienda.sh <desde> <hasta>
# Sale con 0 si no hay nada, con 1 si encuentra algo y con 2 si no pudo revisar.
#
# Los bloques de información de tienda y cafetería del club (`tienda-y-cafeteria`,
# la migración `tienda_y_cafeteria`) son una corrección de la tesis del 2026-10-12: no cuentan.
set -euo pipefail
desde=${1:?Falta desde (por ejemplo origin/main)}
hasta=${2:?Falta hasta (por ejemplo origin/qa)}

# Sin esto, una referencia mal escrita o sin traer da un diff vacío y la respuesta sería «nada».
for r in "$desde" "$hasta"; do
  git rev-parse -q --verify "$r^{commit}" > /dev/null || { echo "No existe $r: revisa el nombre o haz git fetch." >&2; exit 2; }
done

archivos=$(git diff --name-only "$desde...$hasta" | grep -i tienda | grep -viE 'tienda[-_]y[-_]cafeteria' || true)
interruptor=$(git diff "$desde...$hasta" | grep -E '^\+.*TIENDA_HABILITADA' || true)

if [ -z "$archivos$interruptor" ]; then
  echo "Nada de la tienda entre $desde y $hasta."
  exit 0
fi
echo "Entra código de la tienda (Etapa 2) entre $desde y $hasta:"
[ -n "$archivos" ] && printf '  %s\n' $archivos
[ -n "$interruptor" ] && echo "  (y líneas nuevas con TIENDA_HABILITADA)"
exit 1
