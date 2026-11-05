'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cytv-legacy-manager-'));
process.env.CYTV_LEGACY_UJ651V='1';process.env.CYTV_DIR=tmp;process.env.CYTV_SERVICE_DIR=tmp+'/package';
const config=require('../../helper/config').memory({options:{debloat:false,inputKey:false,liveTv:false,tuner:false}});
const debloat=require('../../helper/debloat'),events=[];
let fail=false;
debloat.apply=async(on,options)=>{events.push({apply:on,options});if(on&&fail)throw new Error('fixture partial apply');return {ok:true};};
debloat.change=async()=>{};
const ctx={version:'1.6.14',config,luna:async(uri,p)=>{events.push({uri,p});return {returnValue:true};},feature:()=>null,inputhook:{status:()=>({}),ensure:()=>{}}};
const manager=require('../../helper/manager').create(ctx);
async function call(url,body){let data;const res={writeHead:()=>{},setHeader:()=>{},end:s=>{data=JSON.parse(s);}};await manager.handle({method:'POST'},res,url,async()=>body||{});return data;}
async function main(){
 await call('/api/manager/options',{debloat:true});assert.strictEqual(config.options().debloat,true);assert.strictEqual(events[0].apply,true);assert.strictEqual(events[0].options.debloat,true);
 console.log('ok   manager passes current options to legacy debloat');
 await call('/api/manager/options',{debloat:false});events.length=0;fail=true;
 let rejected=false;try{await call('/api/manager/options',{debloat:true});}catch(e){rejected=true;}
 assert(rejected);assert.strictEqual(config.options().debloat,false);assert.deepStrictEqual(events.map(e=>e.apply),[true,false]);
 console.log('ok   failed apply restores resources and persists debloat off');
 fail=false;events.length=0;
 await call('/api/manager/home',{enabled:false});assert(fs.existsSync(tmp+'/DISABLE'));assert.strictEqual(events[0].apply,false);assert.strictEqual(events[1].p.id,'com.cleanyourtv.home');
 await call('/api/manager/home',{enabled:true});assert(!fs.existsSync(tmp+'/DISABLE'));
 console.log('ok   LG Home restores debloat before closing own app without reboot');
 const updates=require('../../helper/updates').create(ctx);assert.strictEqual(await updates.check(),null);
 await updates.updateFrontend('99.0');assert.strictEqual(updates.job().state,'error');
 await updates.updateService('99.0');assert.strictEqual(updates.job().state,'error');
 await updates.rollbackFrontend();assert.strictEqual(updates.job().state,'error');
 updates.watchPackage();assert(updates.status().checkError.indexOf('adapted packages')>=0);
 console.log('ok   unadapted updates and automatic package replacement are refused');
 const verify=require('../../helper/legacyinstall').verifyFiles,body=Buffer.from('owned source'),hash=crypto.createHash('sha256').update(body).digest('hex');
 verify({format:1,files:{'helper.js':hash}},()=>body);
 let reads=0;assert.throws(()=>verify({format:1,files:{'../foreign':hash}},()=>{reads++;return body;}),/Unsafe/);assert.strictEqual(reads,0);
 assert.throws(()=>verify({format:1,files:{'helper.js':hash}},()=>Buffer.from('changed')),/integrity/);
 console.log('ok   boot manifest rejects traversal before reads and detects modified source');
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;}).then(()=>{for(const n of fs.readdirSync(tmp))fs.unlinkSync(path.join(tmp,n));fs.rmdirSync(tmp);});
