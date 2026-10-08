#!/bin/bash
# Screenshot every viewpoint at the given years: tools/views.sh OUTDIR year1 year2 ...
out=$1; shift
mkdir -p "$out"
for v in general tajo puente toros santamaria almocabar banos alameda ciudad mercadillo cenital paseo; do
  for y in "$@"; do VIEW=$v node "$(dirname "$0")/shot.mjs" "$out/$v-$y.png" "$y" > /dev/null || echo "fail $v $y"; done
done
ls "$out" | wc -l
