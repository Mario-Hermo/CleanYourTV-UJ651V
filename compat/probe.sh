#!/bin/sh
# Read-only capability report. No install, restart, mounts, pairing or root changes.
# Run only after separately arranging authorized shell access to the TV.
export PATH=/usr/bin:/usr/sbin:/bin:/sbin
printf '%s\n' 'CleanYourTV UJ651V capability probe (read-only)'
printf 'kernel: '; uname -sr
printf 'architecture: '; uname -m
printf 'libc: '; getconf GNU_LIBC_VERSION 2>/dev/null || printf '%s\n' unknown
printf 'node: '; node --version 2>/dev/null || printf '%s\n' unavailable
printf 'init: '; cat /proc/1/comm 2>/dev/null
for tool in systemctl initctl luna-send curl mount umount tar; do
  printf 'tool %s: ' "$tool"; command -v "$tool" || true
done
printf '%s\n' 'memory:'
grep -E '^(MemTotal|MemAvailable|MemFree|SwapTotal|SwapFree):' /proc/meminfo
printf '%s\n' 'developer storage:'
df -k /media/developer 2>/dev/null
printf 'homebrew boot hooks: '
if [ -d /var/lib/webosbrew/init.d ]; then printf '%s\n' present; else printf '%s\n' absent; fi
# Deliberately exclude network IDs, tokens, full processes and user settings.
if command -v node >/dev/null 2>&1; then
  node -e 'try{var f=require("fs"),j=JSON.parse(f.readFileSync("/usr/palm/applications/com.webos.app.home/appinfo.json","utf8"));console.log("home: "+JSON.stringify({id:j.id,type:j.type,main:j.main}));}catch(e){console.log("home: unreadable");}'
fi
