// webOS3's Home is LSM's ribbon, not a SAM app that can be overlaid.
// Observe new NL_HOME_SHOWN records; keep LG intact as the recovery path.
const fs = require('fs');
const P = require('./paths');
const AM = 'luna://com.webos.applicationManager/';
function parse(line) {
  const match = /\sLSM NL_HOME_SHOWN (\{[^\r\n]*\})\s*$/.exec(line);
  if (!match) return null;
  try {
    const event = JSON.parse(match[1]);
    return typeof event.CLOCK === 'number' && isFinite(event.CLOCK) && event.CLOCK >= 0 ? event : null;
  } catch (_) { return null; }
}
function parseWake(line) {
  const m = /\[([0-9]+(?:\.[0-9]+)?)\].*\btvpowerd NL_POWER_STATE (\{[^\r\n]*\})\s*$/.exec(line);
  if (!m) return null;
  try { const v=JSON.parse(m[2]); return typeof v.old==='string'&&v.old&&v.old!=='Active'&&v.new==='Active'?{CLOCK:Number(m[1]),wake:true}:null; }
  catch (_) { return null; }
}
function create(ctx, io) {
  const opts = io || {};
  const log = opts.log || '/var/log/messages';
  const disabled = opts.disabled || (() => fs.existsSync(P.DISABLE));
  const uptime = opts.uptime || (() => parseFloat(fs.readFileSync(P.PROC + '/uptime', 'utf8')));
  const target = 'com.cleanyourtv.home';
  let position = 0, inode = null, partial = '', lastClock = -Infinity, busy = false, started = false;
  async function observe(line) {
    const event = parse(line) || parseWake(line);
    if (!event || disabled() || busy) return false;
    if (event.wake && !(ctx.config && ctx.config.options().startOnHome === true)) return false;
    const now = uptime();
    if (!isFinite(now) || event.CLOCK > now + 1 || now - event.CLOCK > 3 || event.CLOCK - lastClock < 0.12) return false;
    lastClock = event.CLOCK;
    busy = true;
    try {
      const result = await ctx.luna(AM + 'launch', {id: target});
      if (result.returnValue !== true) console.error('legacy Home: launch refused: ' + (result.errorText || 'unknown'));
      // A successful relaunch alone leaves webOS3's native ribbon on top.
      // This observed LSM method requires the target app id and a reason string.
      // Close only after launch succeeds, preserving LG's recovery UI on failure.
      if (result.returnValue === true) {
        try {
          const close = await ctx.luna('luna://com.webos.surfacemanager.systemui/closeAllSystemUI', {appId:target,reason:'launch'});
          if (close.returnValue !== true) console.error('legacy Home: native ribbon close refused: ' + (close.errorMsg || close.errorText || 'unknown'));
        } catch (e) { console.error('legacy Home: native ribbon close: ' + e.message); }
      }
      return result.returnValue === true;
    } finally { busy = false; }
  }
  function changed() {
    let fd;
    try {
      const stat = fs.statSync(log);
      if (stat.ino !== inode || stat.size < position) { position = 0; partial = ''; inode = stat.ino; }
      if (stat.size === position) return;
      if (stat.size - position > 65536) { position = stat.size - 65536; partial = ''; }
      const buffer = Buffer.alloc(stat.size - position);
      fd = fs.openSync(log, 'r');
      const count = fs.readSync(fd, buffer, 0, buffer.length, position);
      position += count;
      const lines = (partial + buffer.slice(0,count).toString('utf8')).split('\n');
      partial = lines.pop();
      for (const line of lines) observe(line).catch(e => console.error('legacy Home: ' + e.message));
    } catch (e) { if (e.code !== 'ENOENT') console.error('legacy Home log: ' + e.message); }
    finally { if (fd !== undefined) fs.closeSync(fd); }
  }
  function start() {
    if (started) return;
    started = true;
    try { const stat=fs.statSync(log); position=stat.size; inode=stat.ino; } catch (_) {}
    fs.watchFile(log, {interval: 150, persistent:false}, changed);
  }
  function stop() { fs.unwatchFile(log, changed); started = false; }
  return {name:'legacyhome', start, stop, observe, active:() => started && !disabled()};
}
module.exports = {parse, parseWake, create};
