#!/bin/sh
L=/media/developer/cleanyourtv
export CYTV_DIR="$L" CYTV_SERVICE_DIR="$L/package" CYTV_LEGACY_UJ651V=1
i=0
while [ "$i" -lt 12 ]; do
  [ -f "$L/LEGACY_OWNER" ] && [ -f "$L/LEGACY_BOOT_ENABLED" ] || exit 0
  if "$L/runtime/bin/node" "$L/legacyboot.js" start; then
    sleep 3
    "$L/runtime/bin/node" "$L/legacyboot.js" status | grep -q '"active":true' && exit 0
  fi
  i=$((i+1))
  sleep 2
done
echo 'CleanYourTV legacy startup did not become active; stock Home remains available' >&2
exit 1
