'use strict';
// Supervised service startup for the observed Upstart TV. Invoked by its Homebrew hook.
// Uses no systemd, no SAM/LSM restart, no firmware/Home overlay and no system Node replacement.
const fs=require('fs'),path=require('path'),cp=require('child_process'),http=require('http');
const P=require('./paths'),target=require('./legacytarget');
const groups=require('./legacygroup');
const OWNER=path.join(P.D,'LEGACY_OWNER'),STOP=path.join(P.D,'LEGACY_STOP');
const RUN='/tmp/cleanyourtv-legacy-supervisor.json',LOG='/tmp/cleanyourtv-legacy-boot.log';
const LOCK=RUN+'.lock';
function tick(pid){try{const s=fs.readFileSync('/proc/'+pid+'/stat','utf8');return s.slice(s.lastIndexOf(') ')+2).trim().split(/\s+/)[19];}catch(_){return null;}}
function alive(record,owner){return !!record&&record.owner===owner&&record.boot===fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim()&&tick(record.pid)===record.start;}
function command(file,args){const r=cp.spawnSync(file,args,{encoding:'utf8',timeout:10000,env:P.ENV,stdio:['ignore','pipe','pipe']});if(r.error||r.status!==0)throw new Error(file+': '+String(r.stderr||r.error));return r;}
function own(){
  if(!P.LEGACY_UJ651V||process.getuid()!==0)throw new Error('Explicit legacy root mode required');
  const owner=fs.readFileSync(OWNER,'utf8').trim();if(!/^[a-f0-9]{24}$/.test(owner))throw new Error('Invalid installation owner');
  target.identity(command);return owner;
}
function readRun(){try{return JSON.parse(fs.readFileSync(RUN,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
function health(){return new Promise(resolve=>{
  let done=false;function finish(v){if(done)return;done=true;resolve(v);}
  const q=http.get('http://127.0.0.1:8765/api/service',r=>{let data='';r.on('data',b=>data+=b);r.on('end',()=>{try{const j=JSON.parse(data);finish(r.statusCode===200&&j.version==='1.6.14'&&Array.isArray(j.features)&&j.features.indexOf('legacyhome')>=0&&Object.keys(j.failed||{}).length===0);}catch(_){finish(false);}});});
  q.setTimeout(2500,()=>q.destroy(new Error('health timeout')));q.on('error',()=>finish(false));
});}
function run(owner){
  const previous=readRun();if(alive(previous,owner))throw new Error('Supervisor already running');
  if(previous&&tick(previous.pid))throw new Error('Stale supervisor identity; inspect');
  const record={owner,boot:fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim(),pid:process.pid,start:tick(process.pid),helper:null,ready:false,closed:false};
  // Exclusive ownership also covers two almost simultaneous boot/start requests.
  if(fs.existsSync(LOCK)){
    const old=JSON.parse(fs.readFileSync(LOCK,'utf8'));
    if(old.owner!==owner||alive(old,owner)||tick(old.pid))throw new Error('Supervisor lock retained; inspect');
    fs.unlinkSync(LOCK);
  }
  const lock=fs.openSync(LOCK,'wx',0o600);fs.writeFileSync(lock,JSON.stringify(record));fs.closeSync(lock);
  let child,closing=false,busy=false,failures=0,starts=0;
  function save(){fs.writeFileSync(RUN+'.tmp',JSON.stringify(record),{mode:0o600});fs.renameSync(RUN+'.tmp',RUN);}
  function note(text){fs.appendFileSync(LOG,String(Date.now())+' '+text+'\n',{mode:0o600});}
  function group(){if(!record.helper)return false;try{process.kill(-record.helper.pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}}
  async function close(reason){if(closing)return;closing=true;record.reason=reason;save();note(reason);
    // Stop observation immediately, before any cleanup or potentially slow Luna operation.
    fs.writeFileSync(P.DISABLE,'legacy service stopped: '+reason+'\n',{mode:0o600});
    try{record.helperAbsent=!record.helper||await groups.retire(record.helper);}catch(e){record.stopError=e.message;record.helperAbsent=false;}
    {
      if(!record.helperAbsent)record.stopError=record.stopError||'Owned helper group remains; inspect';
      try{command(process.execPath,[path.join(__dirname,'legacydebloat.js'),'undo']);record.debloatRestored=true;}catch(e){record.restoreError=e.message;}
      try{command('/usr/bin/luna-send',['-n','1','-w','4000','-f','luna://com.webos.applicationManager/closeByAppId',JSON.stringify({id:P.HOME_ID})]);}catch(e){record.appCloseError=e.message;}
      record.closed=record.helperAbsent;save();
      if(!record.closed){process.exit(1);return;}
      const held=JSON.parse(fs.readFileSync(LOCK,'utf8'));if(held.owner===owner&&held.pid===record.pid&&held.start===record.start)fs.unlinkSync(LOCK);
      process.exit(record.restoreError?1:0);
    }
  }
  function start(){
    if(closing)return;
    if(++starts>3)return close('helper restart limit');
    const fd=fs.openSync('/tmp/cleanyourtv-helper.log','a',0o600);
    child=cp.spawn(process.execPath,[path.join(__dirname,'helper.js')],{cwd:P.D,env:Object.assign({},P.ENV,{CYTV_LEGACY_UJ651V:'1'}),detached:true,stdio:['ignore',fd,fd]});fs.closeSync(fd);
    record.helper={pid:child.pid,start:tick(child.pid)};record.starts=starts;save();
    child.on('error',e=>close('helper spawn: '+e.message));
    const owned=record.helper;
    child.on('close',async()=>{if(!closing){
      try{if(!await groups.retire(owned))return close('helper group cleanup failed');}
      catch(e){return close(e.message);}
      if(!closing)setTimeout(start,2000*starts);
    }});
  }
  save();start();
  const timer=setInterval(async()=>{
    if(closing||busy)return;busy=true;
    try{
      if(fs.existsSync(STOP))return close('requested');
      const good=await health();
      if(good){
        failures=0;record.ready=true;save();
        const options=JSON.parse(fs.readFileSync(P.CONF,'utf8')).options||{},mark='/tmp/cleanyourtv-legacy-home-shown';
        if(options.startOnHome===true&&!fs.existsSync(P.DISABLE)&&!record.homeBootLaunched&&parseFloat(fs.readFileSync('/proc/uptime','utf8'))>=20){
          let shown=null;try{shown=JSON.parse(fs.readFileSync(mark,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
          if(shown&&shown.owner!==owner)throw new Error('Foreign Home startup marker retained');
          if(shown&&shown.boot===record.boot)record.homeBootLaunched=true;
          else{
            record.homeAttempts=(record.homeAttempts||0)+1;
            const luna=require('./luna'),opened=await luna('luna://com.webos.applicationManager/launch',{id:P.HOME_ID,params:{mode:'home'}});
            if(opened.returnValue===true){
              const closed=await luna('luna://com.webos.surfacemanager.systemui/closeAllSystemUI',{appId:P.HOME_ID,reason:'launch'});
              if(closed.returnValue!==true)record.homeCloseError=closed.errorMsg||closed.errorText||'close refused';
              fs.writeFileSync(mark,JSON.stringify({owner,boot:record.boot}),{mode:0o600});record.homeBootLaunched=true;
            }else{record.homeLaunchError=opened.errorText||'launch refused';if(record.homeAttempts>=3)close('startup Home did not open');}
          }save();
        }
      }
      else if(++failures>=6)close('service unreachable for one minute');
    }catch(e){close(e.message);}finally{busy=false;}
  },10000);
  // Apply configured debloat only after the helper answers. Defaults remain off until explicitly chosen.
  setTimeout(async()=>{
    if(closing||!await health())return;
    try{
      const o=(JSON.parse(fs.readFileSync(P.CONF,'utf8')).options||{});
      if(o.debloat&&!fs.existsSync(P.DISABLE)&&!fs.existsSync(path.join(P.D,'DISABLE-DEBLOAT'))){
        const off=o.debloatOff||[],groups=require('./legacydebloat').GROUPS.filter(g=>off.indexOf(g)<0);
        if(groups.length)command(process.execPath,[path.join(__dirname,'legacydebloat.js'),'apply'].concat(groups));
        record.debloatApplied=groups;save();
      }
    }catch(e){record.debloatError=e.message;save();close('debloat failed');}
  },60000);
  process.on('SIGTERM',()=>{clearInterval(timer);close('SIGTERM');});
}
function main(){
  const owner=own(),action=process.argv[2],record=readRun();
  if(action==='run')return run(owner);
  if(action==='status'){console.log(JSON.stringify({active:alive(record,owner),record}));return;}
  if(action==='stop'){
    if(record&&tick(record.pid)&&!alive(record,owner))throw new Error('Foreign/stale supervisor identity; retained');
    fs.writeFileSync(STOP,owner,{mode:0o600});console.log(JSON.stringify({stopRequested:alive(record,owner)}));return;
  }
  if(action!=='start')throw new Error('Expected start, run, status or stop');
  if(alive(record,owner)){console.log('Supervisor already running');return;}
  if(record&&tick(record.pid))throw new Error('Foreign/stale supervisor identity; retained');
  // Never share the fixed loopback port with another service.
  const guard=require('net').createServer();guard.on('error',()=>{console.error('Loopback port busy; nothing started');process.exitCode=1;});
  guard.listen(8765,'127.0.0.1',()=>guard.close(()=>{
    if(fs.existsSync(STOP))fs.unlinkSync(STOP);
    const fd=fs.openSync(LOG,'a',0o600);
    const child=cp.spawn(process.execPath,[__filename,'run'],{cwd:P.D,env:P.ENV,detached:true,stdio:['ignore',fd,fd]});fs.closeSync(fd);child.unref();console.log('Supervisor start requested');
  }));
}
if(require.main===module){try{main();}catch(e){console.error(e.stack);process.exitCode=1;}}
module.exports={tick,alive,health};
