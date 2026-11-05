// Switching the debloat on and off while the TV runs (the boot script 15-cleanyourtv-debloat applies it at every start). What it
// stops and blocks is in scripts/debloat-stop.sh; scripts/debloat-undo.sh reverses it. Its four groups can be switched off one by
// one: options.debloatOff in config.json lists those, and debloat-stop.sh reads it.
const P = require('./paths'),
  exec = require('./exec');

const GROUPS = ['ads', 'tracking', 'logs', 'suggestions'];

function apply(on, options) {
  if (P.LEGACY_UJ651V) return legacy(on ? 'apply' : 'undo', on ? GROUPS.filter(g => {
    const o = options || require('./config').main().options(); return cleanOff(o.debloatOff).indexOf(g) < 0;
  }) : GROUPS);
  const link = P.INITD + '/15-cleanyourtv-debloat';
  if (on) return exec.sh('ln -sf ' + P.D + '/15-cleanyourtv-debloat ' + link + '; sh ' + P.D + '/debloat-stop.sh', 60000);
  return exec.sh('rm -f ' + link + '; sh ' + P.D + '/debloat-undo.sh', 60000);
}

// while the debloat is on: undo the groups that were switched off, apply the ones switched on again
async function change(offBefore, offAfter) {
  const undo = offAfter.filter(g => offBefore.indexOf(g) < 0),
    redo = offBefore.filter(g => offAfter.indexOf(g) < 0);
  if (undo.length) {
    if (P.LEGACY_UJ651V) await legacy('undo', undo);
    else await exec.sh('sh ' + P.D + '/debloat-undo.sh ' + undo.join(' '), 60000);
  }
  if (redo.length) {
    if (P.LEGACY_UJ651V) await legacy('apply', redo);
    else await exec.sh('sh ' + P.D + '/debloat-stop.sh ' + redo.join(' '), 60000);
  }
}
async function legacy(action, groups) {
  if (!groups.length) return {ok:true};
  const r = await exec.run(process.execPath,[require('path').join(__dirname,'legacydebloat.js'),action].concat(groups),{timeout:40000});
  if (!r.ok) throw new Error('Legacy debloat: '+(r.err||r.error));
  return r;
}

// the groups that are off, from a request: known names only, each once
const cleanOff = list => GROUPS.filter(g => Array.isArray(list) && list.indexOf(g) >= 0);

module.exports = { apply, change, cleanOff, GROUPS };
