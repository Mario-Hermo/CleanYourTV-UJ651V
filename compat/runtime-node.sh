#!/bin/sh
# Private runtime only. Never change the system loader, node, or library path.
# Installed as runtime/bin/node, alongside bin/node.bin and ../lib/*.so*.
CYTV_RUNTIME=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd) || exit 1
for CYTV_FILE in lib/ld-linux-armhf.so.3 bin/node.bin runtime-preload.js; do
  [ -r "$CYTV_RUNTIME/$CYTV_FILE" ] || { echo "CleanYourTV private runtime incomplete: $CYTV_FILE" >&2; exit 1; }
done
export CYTV_RUNTIME
exec "$CYTV_RUNTIME/lib/ld-linux-armhf.so.3" --library-path "$CYTV_RUNTIME/lib" \
  "$CYTV_RUNTIME/bin/node.bin" --require "$CYTV_RUNTIME/runtime-preload.js" "$@"
