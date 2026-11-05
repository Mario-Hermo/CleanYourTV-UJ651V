'use strict';
const assert=require('assert'),cp=require('child_process'),path=require('path');
if(!process.argv[2]){
 for(const mode of ['stock','legacy']){
  const result=cp.spawnSync(process.execPath,[__filename,mode],{encoding:'utf8',env:Object.assign({},process.env,{CYTV_LEGACY_UJ651V:mode==='legacy'?'1':'0',CYTV_RUNTIME:path.resolve('private-runtime-fixture')})});
  process.stdout.write(result.stdout||'');
  if(result.status!==0){process.stderr.write(result.stderr||'');process.exit(1);}
 }
}else{
 const P=require('../../helper/paths'),legacy=process.argv[2]==='legacy';
 assert.strictEqual(P.HOME_ID,legacy?'com.cleanyourtv.home':'com.webos.app.home');
 assert.strictEqual(P.ENV.PATH.split(':')[0],path.join(process.env.CYTV_RUNTIME,'bin').split(':')[0]);
 assert.strictEqual(P.ENV.PATH.indexOf(path.join(process.env.CYTV_RUNTIME,'bin')+':'),0);
 console.log('ok   '+process.argv[2]+' identity and private Node priority');
 const calls=[],config=require('../../helper/config').memory({});
 const feature=require('../../helper/apps').create({config:config,audio:{start:()=>{}},feature:()=>null,luna:async(uri,payload)=>{calls.push({uri,payload});return {returnValue:true};}});
 const res={writeHead:()=>{},setHeader:()=>{},end:()=>{}};
 feature.handle({method:'POST'},res,'/api/launch',async()=>({id:'com.webos.app.home'})).then(()=>{
  assert.strictEqual(calls.length,1);assert.strictEqual(calls[0].payload.id,legacy?'com.cleanyourtv.home':'com.webos.app.home');
  console.log('ok   '+process.argv[2]+' Home launch mapping preserves ordinary behaviour');
 }).catch(e=>{console.error(e.stack);process.exitCode=1;});
}
