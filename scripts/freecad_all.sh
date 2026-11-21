#!/usr/bin/env bash
# The FreeCAD and STEP files of a piece : data, build, GUI pass with the screws and the STEP files, check on the document
# Usage : scripts/freecad_all.sh <output folder, under the home : the FreeCAD flatpak has a private /tmp> [tv|dresser]
set -euo pipefail

OUT="$(realpath -m "${1:-$HOME/calc/s32_cad/livraison}")"
SOURCES="${S32_SOURCES:-$HOME/calc/s32_cad/sources}"
HERE="$(cd "$(dirname "$0")" && pwd)"
APP=org.freecad.FreeCAD
mkdir -p "$OUT/json"
(cd "$HERE/.." && npm run --silent cad -- "$OUT/json")

for piece in ${2:-tv dresser}
do
    json="$OUT/json/$piece.json"
    flatpak run --env=S32_JSON="$json" --env=S32_OUT="$OUT" --env=S32_SOURCES="$SOURCES" --env=S32_SCRIPTS="$HERE" \
        --env=S32_DRAWINGS="${S32_DRAWINGS:-}" --command=FreeCADCmd "$APP" \
        -c "exec(open('$HERE/freecad_build.py').read())" 2>&1 | grep -E '^pieces|^\{|Traceback|Error:' || true
    # A window opens and closes alone, some minutes for each piece
    # FreeCAD 1.1.4 often crashes on closing that window, after the save : its exit code says nothing, the saved document
    # and the error file writen by the macro do
    marker="$OUT/$piece.view.start"
    : > "$marker"
    view_code=0
    flatpak run --env=S32_JSON="$json" --env=S32_DOC="$OUT/$piece.FCStd" --env=S32_IMAGE="$OUT/$piece.png" \
        --env=S32_STEP_DIR="$OUT/step_$piece" "$APP" "$HERE/freecad_view.py" > "$OUT/$piece.view.log" 2>&1 \
        || view_code=$?
    if [ -s "$OUT/$piece.png.erreur.txt" ]
    then
        cat "$OUT/$piece.png.erreur.txt"
        exit 1
    fi
    if [ ! "$OUT/$piece.FCStd" -nt "$marker" ]
    then
        echo "La passe d'interface de $piece n'a pas enregistré le document (code $view_code), voir $OUT/$piece.view.log"
        exit 1
    fi
    flatpak run --env=S32_JSON="$json" --env=S32_DOC="$OUT/$piece.FCStd" --command=FreeCADCmd "$APP" \
        -c "exec(open('$HERE/freecad_check.py').read())" 2>&1 | grep -E '^\{|^VERDICT|Traceback|Error:' || true
    # The check says whether the piece is right : a failed one stops the chain, no check written stops it as well
    report="$OUT/${piece}_controle.json"
    if ! python3 -c "import json, sys; sys.exit(0 if json.load(open('$report'))['verdict']['ok'] else 1)"
    then
        echo "ECHEC du contrôle de $piece, voir $OUT/${piece}_controle.json"
        failed=1
    fi
done
echo "FIN : $OUT"
exit "${failed:-0}"
