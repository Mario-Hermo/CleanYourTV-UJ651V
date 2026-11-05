'use strict';
const assert=require('assert'),engine=require('../../helper/legacydebloat'),target=require('../../helper/legacytarget');
function fixture(running) {
  const state={owner:'fixture',boot:'fixture'},files={'/etc/hosts':'127.0.0.1 localhost\n','/usr/sbin/acr2':'real'},mounts={},calls=[];
  let logger=running!==false,acr=1,fail=false;
  const io={ram:'/ram',load:()=>state,save:()=>{},read:p=>files[p],exists:p=>p in files,
    write:(p,s)=>{files[p]=s;},mounted:p=>mounts[p]?mounts[p].count:0,
    sameFile:(a,b)=>!!mounts[a]&&mounts[a].source===b,
    loggerRunning:()=>logger,stopAcr:()=>{calls.push('kill-exact-acr');acr=0;},
    run:(cmd,args)=>{
      calls.push([cmd,args]);
      if(cmd==='/bin/mount'){if(fail)throw new Error('mount failed');mounts[args[2]]={source:args[1],count:1};}
      else if(cmd==='/bin/umount')delete mounts[args[0]];
      else if(cmd==='/sbin/initctl'){assert.strictEqual(args[1],'remotelogger');logger=args[0]==='start';}
      else throw new Error('Unexpected command');
    }};
  return {state,files,mounts,calls,api:engine.create(io),logger:()=>logger,acr:()=>acr,failMount:()=>{fail=true;}};
}
target.verify(Object.assign({returnValue:true},target.TARGET));
for(const key of Object.keys(target.TARGET))assert.throws(()=>target.verify(Object.assign({returnValue:true},target.TARGET,{[key]:'other'})),/Unsupported/);
console.log('ok   exact hardware, firmware, OTA and SDK required');
{
  const f=fixture();const r=f.api.apply(engine.GROUPS);
  assert.strictEqual(f.logger(),false);assert.strictEqual(f.acr(),0);
  assert.deepStrictEqual(r.unsupported,['suggestions']);
  assert.strictEqual(f.files['/etc/hosts'],'127.0.0.1 localhost\n');
  assert(f.files['/ram/hosts'].indexOf('nl.ad.lgsmartad.com')>=0);
  assert(f.calls.every(c=>JSON.stringify(c).indexOf('admanager')<0));
  const count=f.calls.length;f.api.apply(engine.GROUPS);assert.strictEqual(f.calls.length,count+1); // exact-process cleanup only
  f.api.undo(engine.GROUPS);assert.strictEqual(f.logger(),true);assert.deepStrictEqual(f.mounts,{});
  assert.deepStrictEqual(f.state,{owner:'fixture',boot:'fixture'});
  console.log('ok   groups apply idempotently, preserve hosts on disk and admanager, undo only owned changes');
}
{
 const f=fixture(false);f.api.apply(['logs']);f.api.undo(['logs']);assert.strictEqual(f.logger(),false);assert.deepStrictEqual(f.calls,[]);
 console.log('ok   initially stopped logger is not started by undo');
}
{
 const f=fixture();f.mounts['/etc/hosts']={source:'/foreign',count:1};
 assert.throws(()=>f.api.apply(['ads']),/foreign/);assert.strictEqual(f.mounts['/etc/hosts'].source,'/foreign');assert.deepStrictEqual(f.calls,[]);
 console.log('ok   existing foreign hosts layer is preserved before mutation');
}
{
 const f=fixture();f.api.apply(['ads']);f.mounts['/etc/hosts']={source:'/foreign',count:2};
 assert.throws(()=>f.api.undo(['ads']),/Foreign/);assert(f.state.hosts);assert.strictEqual(f.mounts['/etc/hosts'].count,2);
 console.log('ok   undo refuses a later foreign or stacked mount and retains recovery state');
}
{
 const f=fixture();f.failMount();assert.throws(()=>f.api.apply(['ads']),/mount failed/);assert(f.state.hosts);
 f.api.undo(['ads']);assert(!f.state.hosts);assert.deepStrictEqual(f.files['/etc/hosts'],'127.0.0.1 localhost\n');
 console.log('ok   failed mount leaves recoverable ownership state without rewriting hosts');
}
{
 const f=fixture();assert.throws(()=>f.api.apply(['logs','unknown']),/Unknown/);assert.throws(()=>f.api.undo(['unknown']),/Unknown/);
 assert.deepStrictEqual(f.calls,[]);assert.strictEqual(f.logger(),true);
 console.log('ok   invalid group rejected before any operation');
}
