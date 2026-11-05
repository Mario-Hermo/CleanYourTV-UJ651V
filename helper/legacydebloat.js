'use strict';
// UJ651V: retain the upstream groups and endpoints, with Upstart and owned RAM mounts.
// No firmware files, Upstart definitions or admanager are modified.
const fs = require('fs'), cp = require('child_process'), path = require('path');
const GROUPS = ['ads','tracking','logs','suggestions'];
const HOST_LINES = '\n127.0.0.1 eic.ads.lgtvcommon.com nl.ad.lgsmartad.com nl.info.lgsmartad.com # cleanyourtv-debloat\n' +
  '::1 eic.ads.lgtvcommon.com nl.ad.lgsmartad.com nl.info.lgsmartad.com # cleanyourtv-debloat\n';
function create(io) {
  const state = io.load();
  function save() { io.save(state); }
  function unmount(key, target) {
    const item = state[key]; if (!item) return;
    if (io.mounted(target)) {
      if (!io.sameFile(target,item.source) || io.mounted(target) !== 1)
        throw new Error('Foreign or stacked mount retained: ' + target);
      io.run('/bin/umount',[target]);
      if (io.mounted(target)) throw new Error('Mount still present: ' + target);
    }
    delete state[key]; save();
  }
  function bind(key, target, source, content) {
    if (io.mounted(target)) {
      if (state[key] && state[key].source === source && io.sameFile(target,source) && io.mounted(target) === 1) return;
      throw new Error('Existing foreign mount retained: ' + target);
    }
    io.write(source,content);
    state[key] = {source:source}; save(); // record ownership before the operation
    io.run('/bin/mount',['--bind',source,target]);
    if (io.mounted(target) !== 1 || !io.sameFile(target,source)) throw new Error('Bind not verified: ' + target);
  }
  function apply(groups) {
    for (const g of groups) if (GROUPS.indexOf(g) < 0) throw new Error('Unknown debloat group');
    if (groups.indexOf('logs') >= 0 && !state.logger && io.loggerRunning()) {
      state.logger = {wasRunning:true}; save();
      io.run('/sbin/initctl',['stop','remotelogger']);
      if (io.loggerRunning()) throw new Error('remotelogger did not stop');
    }
    if (groups.indexOf('tracking') >= 0 && io.exists('/usr/sbin/acr2')) {
      bind('acr','/usr/sbin/acr2',io.ram+'/noop','#!/bin/sh\nexit 0\n');
      io.stopAcr();
    }
    if (groups.indexOf('ads') >= 0) {
      // Always a RAM copy, including when the TV happens to expose writable hosts.
      if (!state.hosts) bind('hosts','/etc/hosts',io.ram+'/hosts',io.read('/etc/hosts')+HOST_LINES);
      else if (io.mounted('/etc/hosts') !== 1 || !io.sameFile('/etc/hosts',state.hosts.source))
        throw new Error('Owned hosts mount changed; retained for inspection');
    }
    return {groups:groups,unsupported:groups.indexOf('suggestions')>=0?['suggestions']:[],state:state};
  }
  function undo(groups) {
    for (const g of groups) if (GROUPS.indexOf(g) < 0) throw new Error('Unknown debloat group');
    if (groups.indexOf('ads') >= 0) unmount('hosts','/etc/hosts');
    if (groups.indexOf('tracking') >= 0) unmount('acr','/usr/sbin/acr2');
    if (groups.indexOf('logs') >= 0 && state.logger) {
      if (state.logger.wasRunning && !io.loggerRunning()) io.run('/sbin/initctl',['start','remotelogger']);
      if (state.logger.wasRunning && !io.loggerRunning()) throw new Error('remotelogger not restored');
      delete state.logger; save();
    }
    return {restored:groups,state:state};
  }
  return {apply,undo};
}
function native() {
  if (process.getuid() !== 0 || process.env.CYTV_LEGACY_UJ651V !== '1') throw new Error('Explicit legacy root mode required');
  const P = require('./paths');
  const run = (file,args) => {
    const r=cp.spawnSync(file,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:8000,env:P.ENV});
    if (r.error || r.status !== 0) throw new Error(file+': '+String(r.stderr||r.error||r.status));
    return r;
  };
  require('./legacytarget').identity(run);
  const owner=fs.readFileSync(path.join(P.D,'LEGACY_OWNER'),'utf8').trim();
  if (!/^[a-f0-9]{24}$/.test(owner)) throw new Error('Missing installation ownership');
  const ram='/tmp/cleanyourtv-legacy-debloat', file=ram+'/state.json';
  if (!fs.existsSync(ram)) fs.mkdirSync(ram,0o700);
  if (!fs.lstatSync(ram).isDirectory() || fs.lstatSync(ram).isSymbolicLink()) throw new Error('Unsafe RAM state directory');
  const boot=fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();
  const io = {
    ram,run,exists:fs.existsSync,read:p=>fs.readFileSync(p,'utf8'),
    load:() => { const s=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{owner,boot};
      if (s.owner!==owner || s.boot!==boot) throw new Error('Foreign or stale debloat state'); return s; },
    save:s=>{fs.writeFileSync(file+'.tmp',JSON.stringify(s),{mode:0o600});fs.renameSync(file+'.tmp',file);},
    write:(p,content)=>{if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw new Error('Unsafe source');fs.writeFileSync(p,content,{mode:0o700});},
    mounted:p=>fs.readFileSync('/proc/mounts','utf8').split('\n').filter(l=>l.split(' ')[1]===p).length,
    sameFile:(a,b)=>{try{const x=fs.statSync(a),y=fs.statSync(b);return x.dev===y.dev&&x.ino===y.ino;}catch(_){return false;}},
    loggerRunning:()=>/^remotelogger start\/running/.test(String(run('/sbin/initctl',['status','remotelogger']).stdout)),
    stopAcr:()=>{
      for(const pid of fs.readdirSync('/proc').filter(p=>/^\d+$/.test(p))){
        try {
          const exe=fs.readlinkSync('/proc/'+pid+'/exe');
          // A bind mount hides the path, but existing processes retain the original exe.
          if(exe!=='/usr/sbin/acr2') continue;
          const stat=fs.readFileSync('/proc/'+pid+'/stat','utf8');
          if(fs.readlinkSync('/proc/'+pid+'/exe')!==exe||fs.readFileSync('/proc/'+pid+'/stat','utf8').split(') ')[1].split(' ')[19]!==stat.split(') ')[1].split(' ')[19])continue;
          process.kill(Number(pid),'SIGKILL');
        } catch(e){if(e.code!=='ENOENT'&&e.code!=='ESRCH')throw e;}
      }
    }
  };
  return create(io);
}
if(require.main===module){
  try {
    const action=process.argv[2],groups=process.argv.slice(3);
    if(['apply','undo'].indexOf(action)<0)throw new Error('Expected apply or undo');
    // Validate before inspecting or changing host state.
    if(groups.some(g=>GROUPS.indexOf(g)<0))throw new Error('Unknown debloat group');
    console.log(JSON.stringify(native()[action](groups.length?groups:GROUPS)));
  } catch(e){console.error(e.stack);process.exitCode=1;}
}
module.exports={create,GROUPS,HOST_LINES};
