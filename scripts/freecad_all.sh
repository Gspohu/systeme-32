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
    # Every report of this run is newer than this mark : one a crash left from an earlier run never counts
    started="$OUT/$piece.run.start"
    : > "$started"
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
        --env=S32_STEP_DIR="$OUT/step_$piece" --env=S32_SCRIPTS="$HERE" "$APP" "$HERE/freecad_view.py" \
        > "$OUT/$piece.view.log" 2>&1 \
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
    # The build, the screws and the check say whether the piece is right, each report of this run
    if ! python3 "$HERE/freecad_verdict.py" "$OUT" "$piece" "$started"
    then
        failed=1
    fi
done
echo "FIN : $OUT"
exit "${failed:-0}"
