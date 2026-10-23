#!/usr/bin/env bash
# Los PR fusionados en qa que la promoción lleva a main, en orden, con su título.
# Uso: prs-incluidos.sh [desde=origin/main] [hasta=origin/qa]
set -euo pipefail
desde=${1:-origin/main}
hasta=${2:-origin/qa}

# Solo los merges de PR sobre la línea de qa: un «Merge branch 'main' into qa» (una urgencia
# traída de vuelta) no es un PR nuevo.
git log --merges --first-parent --reverse --format='%s' "$desde..$hasta" |
  sed -nE 's/^Merge pull request #([0-9]+) from .*/\1/p' |
  while read -r n; do
    printf '#%s\t%s\n' "$n" "$(gh pr view "$n" --json title -q .title)"
  done
