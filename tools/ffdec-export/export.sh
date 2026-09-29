#!/usr/bin/env bash
# Export SWFs with JPEXS FFDec into the layout SWF Studio loads:
#   <out>/<name>/<name>.xml  + scripts/ shapes/ images/ morphshapes/ fonts/ sounds/ texts/
#
# Usage:  tools/ffdec-export/export.sh <out-dir> file1.swf [file2.swf …]
# e.g.    tools/ffdec-export/export.sh game-files/fish-full/external game-files/swfs/bassken_scene.swf
#
# Needs Java and FFDec. Point FFDEC_JAR at ffdec.jar (default: ./ffdec/ffdec.jar) and
# JAVA at a java binary (default: java on PATH). Without an installed JDK, a portable
# runtime works:  python3 -m pip install jdk4py  →  JAVA=$(python3 -c "import jdk4py; print(jdk4py.JAVA)")
set -euo pipefail
out=${1:?usage: export.sh <out-dir> file.swf...}; shift
JAVA=${JAVA:-java}
FFDEC_JAR=${FFDEC_JAR:-ffdec/ffdec.jar}
[ -f "$FFDEC_JAR" ] || { echo "ffdec.jar not found (set FFDEC_JAR); get FFDec from https://github.com/jindrapetrik/jpexs-decompiler/releases" >&2; exit 1; }
ffdec() { "$JAVA" --enable-native-access=ALL-UNNAMED -Djava.awt.headless=true -jar "$FFDEC_JAR" "$@"; }
for swf in "$@"; do
  name=$(basename "$swf" .swf)
  dest="$out/$name"
  mkdir -p "$dest"
  echo "== $name"
  ffdec -swf2xml "$swf" "$dest/$name.xml"
  ffdec -export script,image,shape,morphshape,font,sound,text "$dest" "$swf"
done
