'use strict';
const assert=require('assert'),group=require('../../helper/legacygroup');
async function main(){
 let list=[{pid:17,group:15,start:'102'}],signals=[];
 const owned={pid:15,start:'100'},io={scan:()=>list,self:1,wait:async()=>{},signal:(p,s)=>{signals.push([p,s]);list=[];}};
 assert.strictEqual(await group.retire(owned,io),true);assert.deepStrictEqual(signals,[[15,'SIGTERM']]);
 console.log('ok   orphaned Luna subscription is retired after leader exit');
 for(const member of [{pid:15,group:15,start:'200'},{pid:17,group:15,start:'99'},{pid:1,group:15,start:'101'},{pid:17,group:16,start:'101'}]){
  signals=[];list=[member];let rejected=false;try{await group.retire({pid:15,start:'100'},io);}catch(e){rejected=true;}
  assert(rejected);assert.deepStrictEqual(signals,[]);
 }
 console.log('ok   reused leader, old member, own process and foreign group refused before signals');
 list=[{pid:17,group:15,start:'102'}];signals=[];
 io.signal=(p,s)=>{signals.push(s);if(s==='SIGKILL')list=[];};
 assert.strictEqual(await group.retire({pid:15,start:'100'},io),true);assert.deepStrictEqual(signals,['SIGTERM','SIGKILL']);
 console.log('ok   bounded escalation confined to continuously owned group');
 list=[{pid:17,group:15,start:'102'}];signals=[];
 let rejected=false;try{await group.retire({pid:15,start:'100',retired:true},io);}catch(e){rejected=true;}
 assert(rejected);assert.deepStrictEqual(signals,[]);
 console.log('ok   never signals a group again once ownership was retired');
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
