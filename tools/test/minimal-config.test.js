'use strict';
const assert=require('assert');
process.env.CYTV_LEGACY_UJ651V='1';
process.env.CYTV_DIR=require('path').join(require('os').tmpdir(),'cytv-minimal-fixture-'+require('crypto').randomBytes(8).toString('hex'));
const config=require('../../helper/config').memory({options:{debloat:true},voice:{key:'fixture-secret'},keys:{home:'fixture'}});
const apps=require('../../helper/apps').create({config,audio:{start:()=>{}},feature:()=>null,luna:async()=>({returnValue:true,apps:[]})});
const res={writeHead:()=>{},setHeader:()=>{},end:()=>{}};
async function main(){
 await apps.handle({method:'POST'},res,'/api/config',async()=>({interface:'minimal-apple',options:{debloat:false},voice:{key:'changed'}}));
 assert.strictEqual(config.get().interface,'minimal-apple');assert.strictEqual(config.options().debloat,true);assert.strictEqual(config.get().voice.key,'fixture-secret');
 console.log('ok   minimal interface is saved without changing service options or secrets');
 await apps.handle({method:'POST'},res,'/api/config',async()=>({interface:'classic'}));assert.strictEqual(config.get().interface,'classic');
 await apps.handle({method:'POST'},res,'/api/config',async()=>({interface:'<script>invalid</script>'}));assert.strictEqual(config.get().interface,undefined);
 assert.strictEqual(config.get().keys.home,'fixture');
 console.log('ok   original interface can be restored and unknown profiles are rejected');
 const calls=[];let status=0,reply;
 const power=require('../../helper/apps').create({config,audio:{start:()=>{}},feature:()=>null,luna:async(uri,p)=>{calls.push({uri,p});return {returnValue:false,errorText:'fixture refusal'};}});
 await power.handle({method:'POST'},{writeHead:c=>{status=c;},end:s=>{reply=JSON.parse(s);}},'/api/power/off',async()=>({}));
 assert.strictEqual(calls[0].uri,'luna://com.webos.service.tvpower/power/powerOff');assert.strictEqual(status,502);assert.strictEqual(reply.returnValue,false);
 console.log('ok   legacy power uses the published method and reports refusal instead of false success');
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
