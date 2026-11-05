'use strict';
// Disposable full helper startup and read APIs; no mutating HTTP methods.
var fs=require('fs'),path=require('path'),cp=require('child_process'),http=require('http'),https=require('https'),net=require('net');
var base=path.resolve(__dirname),state=path.join(base,'state');
var summary={service_started:false,modules_loaded:[],module_failures:{},responses:[],service_functionality_verified:false,execution_uid:process.getuid()};
var child,finished=false,logFile,errors='';
function request(url,origin){return new Promise(function(resolve){
 var req=http.get({host:'127.0.0.1',port:8765,path:url,headers:origin?{Origin:origin}:{}},function(res){
  var data='';res.on('data',function(b){data+=b;if(data.length>1000000)req.destroy();});
  res.on('end',function(){var value;try{value=JSON.parse(data);}catch(e){value={parse_error:true};}resolve({path:url,status:res.statusCode,value:value});});
 });req.setTimeout(3500,function(){req.destroy(new Error('request timeout'));});req.on('error',function(e){resolve({path:url,error:e.message});});
});}
function stop(ok){if(finished)return;finished=true;clearTimeout(deadline);
 summary.helper_stderr=errors.split('\n').filter(Boolean).slice(0,15);
 function done(){console.log(JSON.stringify(summary));process.exit(ok?0:1);}
 if(child&&child.exitCode===null){child.once('close',done);child.kill('SIGTERM');}else done();
}
var deadline=setTimeout(function(){summary.failure='probe deadline';stop(false);},32000);
var guard=net.createServer();guard.on('error',function(e){summary.failure='loopback port unavailable: '+e.code;stop(false);});
guard.listen(8765,'127.0.0.1',function(){guard.close(function(){
 var env=Object.assign({},process.env,{CYTV_DIR:state,CYTV_SERVICE_DIR:path.join(base,'package'),CYTV_THEMES:path.join(base,'themes'),CYTV_RUNFILE:path.join(state,'run.json')});
 logFile=fs.openSync(path.join(state,'helper.log'),'w');
 child=cp.spawn(process.execPath,[path.join(base,'helper/helper.js')],{cwd:state,env:env,stdio:['ignore',logFile,'pipe']});
 fs.closeSync(logFile);
 child.stderr.on('data',function(b){errors+=b.toString();if(errors.length>20000)errors=errors.slice(-20000);});
 child.on('error',function(e){summary.failure=e.message;stop(false);});
 child.on('close',function(code){if(!finished){summary.failure='helper exited: '+code;stop(false);}});
 var tries=0;
 function wait(){request('/api/version').then(function(r){
  if(r.status!==200||!r.value||r.value.version!=='1.6.14'){if(++tries<20&&!finished)return setTimeout(wait,200);summary.failure='helper not ready';return stop(false);}
  summary.service_started=true;
  return request('/api/service').then(function(status){
   summary.modules_loaded=status.value&&status.value.features||[];summary.module_failures=status.value&&status.value.failed||{};
   var endpoints=['/api/tv','/api/config','/api/foreground','/api/apps','/api/inputs','/api/running','/api/addons'];
   var chain=Promise.resolve();endpoints.forEach(function(url){chain=chain.then(function(){return request(url).then(function(answer){
    var v=answer.value||{};summary.responses.push({path:url,status:answer.status,error:answer.error||v.error||v.errorText||null,returnValue:v.returnValue,array_length:Array.isArray(answer.value)?answer.value.length:undefined,apps_count:Array.isArray(v.apps)?v.apps.length:undefined,inputs_count:Array.isArray(v.devices)?v.devices.length:undefined});
   });});});
   return chain.then(function(){return request('/api/version','https://untrusted.invalid').then(function(answer){
    summary.cors_denied=answer.status===403;
    var expected=['core','notify','voice','theme','wallpapers','cards','inputkey','notifyapi','manager','apps','running','zram','fstrim','addons'];
    summary.probe_passed=expected.every(function(name){return summary.modules_loaded.indexOf(name)>=0;})&&Object.keys(summary.module_failures).length===0&&summary.cors_denied;
    // Full TV functionality is deliberately not inferred from HTTP 200 or empty lists.
    if(process.getuid()!==0)return stop(summary.probe_passed);
    var req=https.request({hostname:'repo.webosbrew.org',path:'/api/apps.json',method:'HEAD'},function(res){
      summary.private_runtime_https={status:res.statusCode,tls:res.socket.getProtocol?res.socket.getProtocol():null};res.resume();res.on('end',function(){stop(summary.probe_passed);});
    });
    req.setTimeout(5000,function(){req.destroy(new Error('HTTPS timeout'));});
    req.on('error',function(e){summary.private_runtime_https={error:e.code||e.message};stop(summary.probe_passed);});req.end();
   });});
  });
 }).catch(function(e){summary.failure=e.message;stop(false);});}
 wait();
});});
