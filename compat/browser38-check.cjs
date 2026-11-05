/* PC-only browser acceptance against a local fake TV. Run with modern Node. */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const PROJECT = path.resolve(ROOT, '../..');
const STUDY = path.join(PROJECT, 'output/cleanyourtv-study-20261102');
const REFERENCE = process.argv.indexOf('--reference') >= 0;
const MINIMAL_CASE = process.argv.indexOf('--minimal') >= 0;
const APP_COUNT = process.argv.indexOf('--perf35') >= 0 ? 35 : 24;
const PAGE_ROOT = REFERENCE && !MINIMAL_CASE ? path.join(STUDY,'source/cleanyourtv-WebOS-69669dcb387c39525ac668d7ae8f7c540c2cd24b') : ROOT;
const OUT = path.join(STUDY, (MINIMAL_CASE?'minimal38-':REFERENCE?'browser-reference-':'browser38-') + Date.now());
fs.mkdirSync(OUT);
const CHROME = REFERENCE ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : path.join(STUDY, 'portable-tools/chromium-288008/chrome-win32/chrome.exe');
const PROBE = '<script>window.__testErrors=[];window.onerror=function(m,s,l){__testErrors.push(String(m)+":"+l)};window.webOSSystem={launchParams:"{}",locale:"en-GB",hide:function(){},activate:function(){},platformBack:function(){},setInputRegion:function(){},setKeyMask:function(){}};</script>';
process.env.CYTV_THEMES = path.join(OUT, 'themes');
fs.cpSync(path.join(ROOT,'themes'),process.env.CYTV_THEMES,{recursive:true});
const themeMod = require('../helper/theme');
const config = require('../helper/config').memory({});
const theme = themeMod.create({config, noStartup: true});
const golden = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/test/golden/api.json'), 'utf8').replace(/<version>/g, '9.9.9'));
const apps = Array.from({length: APP_COUNT}, (_, i) => ({id: 'app.' + i, title: 'Test ' + i}));
if(MINIMAL_CASE) apps.splice(0,4,{id:'netflix',title:'Netflix'},{id:'amazon',title:'Prime Video'},{id:'com.disney.disneyplus-prod',title:'Disney+'},{id:'youtube.leanback.v4',title:'YouTube'});
let fakeConfig = {interface:MINIMAL_CASE?'minimal-apple':'classic',dock:apps.slice(0,4).map(a=>a.id)};
const launches=[];
const pages = {launcher: 'app/index.html', manager: 'manager/app/index.html', picker: 'picker/app/index.html', iptv: 'helper/addons-bundled/iptv/page/index.html'};
const requests = [], results = [];
const json = (res, data) => {res.writeHead(200, {'content-type': 'application/json'}); res.end(JSON.stringify(data));};
let browser, connection, server, argsFile;
const delay = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms) {
  const end = Date.now() + ms;
  let last;
  do {try {const value = await fn(); if (value) return value;} catch (e) {last = e;} await delay(150);} while (Date.now() < end);
  throw last || new Error('condition deadline');
}
async function connect(url) {
  const ws = new WebSocket(url), pending = new Map(); let seq = 0;
  await new Promise((res, rej) => {ws.onopen = res; ws.onerror = rej;});
  ws.onmessage = event => {
    fs.appendFileSync(path.join(OUT,'debug-protocol.jsonl'),String(event.data)+'\n');
    const msg = JSON.parse(event.data), p = pending.get(msg.id);
    if (p) {pending.delete(msg.id); clearTimeout(p.timer); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);}
  };
  return {ws, call(method, params = {}, timeoutMs = 5000) {return new Promise((resolve, reject) => {
    const id = ++seq, timer = setTimeout(() => {pending.delete(id); reject(new Error(method + ' timed out'));}, timeoutMs);
    pending.set(id, {resolve, reject, timer});
    fs.appendFileSync(path.join(OUT,'debug-sent.jsonl'),JSON.stringify({id,method,params})+'\n');
    ws.send(JSON.stringify({id, method, params}));
  });}};
}
async function evaluate(expression) {
  const r = await connection.call('Runtime.evaluate', {expression: 'JSON.stringify(' + expression + ')', returnByValue: true});
  if (r.wasThrown || r.exceptionDetails) throw new Error(JSON.stringify(r));
  return JSON.parse(r.result.value);
}
async function key(code) {
  return evaluate('(function(){["keydown","keyup"].forEach(function(type){var e=document.createEvent("Event");e.initEvent(type,true,true);Object.defineProperty(e,"keyCode",{value:'+code+'});document.dispatchEvent(e);});return MINIMAL.state();})()');
}
async function minimalChecks(){
  const assert=require('assert');
  await until(async()=>evaluate('window.MINIMAL && MINIMAL.enabled() && document.querySelectorAll(".mi-grid .mi-card").length==='+APP_COUNT+' && MINIMAL.state().devices===2'),10000);
  await delay(200);const fastBefore=await evaluate('MINIMAL_FAST.stats()');for(let i=0;i<12;i++)await key(i%2?37:39);await delay(100);const fastAfter=await evaluate('MINIMAL_FAST.stats()');if(!REFERENCE){assert.strictEqual(fastAfter.installed,true);assert.strictEqual(fastAfter.error,'');assert.strictEqual(fastAfter.refreshes,fastBefore.refreshes);assert(fastAfter.ignored>fastBefore.ignored);}
  const geometry=await evaluate('(function(){var r=document.querySelector(".mi-clock").getBoundingClientRect(),g=document.querySelector(".mi-gallery"),s=getComputedStyle(g);return {clockCenter:r.left+r.width/2,apps:[].map.call(document.querySelectorAll(".mi-favorites .mi-label"),function(n){return n.textContent}),galleryOpacity:Number(s.opacity),galleryPointer:s.pointerEvents,galleryAria:g.getAttribute("aria-hidden"),errors:__testErrors.slice()};})()');
  assert.strictEqual(geometry.clockCenter,960);assert.deepStrictEqual(geometry.apps,['Netflix','Prime Video','Disney+','YouTube']);assert(geometry.galleryOpacity<.01);assert.strictEqual(geometry.galleryPointer,'none');assert.strictEqual(geometry.galleryAria,'true');
  const cozy=await evaluate('(function(){var c=document.querySelector(".mi-clock").getBoundingClientRect(),f=document.querySelector(".mi-favorites").getBoundingClientRect(),h=document.querySelector(".mi-hdmi").getBoundingClientRect(),m=document.querySelector(".mi-cozy-mark").getBoundingClientRect();return {clockY:c.top+c.height/2,dockY:f.top,iconWidth:m.width,vectorMarks:document.querySelectorAll(".mi-favorites svg").length,HDMI:{x:h.left,width:h.width},background:getComputedStyle(document.querySelector(".mi-backdrop")).backgroundImage};})()');
  assert(Math.abs(cozy.clockY-540)<30);assert(cozy.dockY>=850);assert(cozy.iconWidth<=56);assert.strictEqual(cozy.vectorMarks,4);assert(cozy.HDMI.x>1400&&cozy.HDMI.width<=320);assert(cozy.background.includes('cozy-wallpaper.jpg'));geometry.cozy=cozy;
  const glyphWidth=await evaluate('document.querySelector(".mi-cozy-mark svg").getBoundingClientRect().width');assert(glyphWidth>=44&&glyphWidth<=48);geometry.cozy.glyphWidth=glyphWidth;
  await evaluate('(function(){window.__wallpaperLoaded=false;var i=new Image();i.onload=function(){window.__wallpaperLoaded=i.naturalWidth>=1920;};i.src="cozy-wallpaper.jpg";return true;})()');await until(async()=>evaluate('__wallpaperLoaded'),5000);
  let s=await key(39);assert.strictEqual(s.focus,1);
  await evaluate('(function(){var n=document.querySelectorAll(".mi-favorites .mi-card")[3],p=document.querySelector(".mi-port");[n,p].forEach(function(el){var e=document.createEvent("MouseEvent");e.initMouseEvent("mousemove",true,true,window,0,0,0,1400,900,false,false,false,false,0,null);el.dispatchEvent(e);});return true;})()');assert.strictEqual((await evaluate('MINIMAL.state()')).focus,1);
  s=await key(40);assert.strictEqual(s.view,'home');assert.strictEqual(s.focus,4);
  s=await key(38);assert.strictEqual(s.view,'home');assert.strictEqual(s.focus,1);
  s=await key(40);assert.strictEqual(s.focus,4);s=await key(40);assert.strictEqual(s.view,'gallery');
  assert.strictEqual(await evaluate('document.querySelector(".mi-gallery").getAttribute("aria-hidden")'),'false');assert.strictEqual(await evaluate('getComputedStyle(document.querySelector(".mi-gallery")).pointerEvents'),'auto');
  s=await key(39);assert.strictEqual(s.gridFocus,1);s=await key(38);assert.strictEqual(s.view,'home');assert.strictEqual(s.focus,4);
  s=await key(38);assert.strictEqual(s.focus,1);s=await key(38);assert.strictEqual(s.focus,-1);
  s=await key(40);assert.strictEqual(s.focus,1);s=await key(38);await key(13);assert.strictEqual(await evaluate('stack.length'),1);await key(27);assert.strictEqual(await evaluate('stack.length'),0);
  await key(13);const settings=await evaluate('(function(){var p=document.querySelector("#ov .panel"),r=p.getBoundingClientRect(),s=getComputedStyle(p);return {radius:s.borderTopLeftRadius,height:r.height,width:r.width,titleFont:getComputedStyle(document.querySelector("#ov h2")).fontSize};})()');assert.strictEqual(settings.radius,'32px');assert(settings.height<950);assert.strictEqual(settings.titleFont,'34px');let settingsShot=await connection.call('Page.captureScreenshot');fs.writeFileSync(path.join(OUT,'settings.png'),Buffer.from(settingsShot.data,'base64'));await key(27);geometry.cozy.settings=settings;
  await key(36);await key(13);await until(async()=>launches.some(a=>a.id==='netflix'),2000);
  for(let i=0;i<4;i++)await key(39);s=await key(39);assert.strictEqual(s.port,1);await key(13);await until(async()=>launches.some(a=>a.id==='com.webos.app.hdmi2'),2000);
  await key(36);await key(38);await key(13);await key(13);s=await evaluate('MINIMAL.state()');assert.strictEqual(s.view,'idle');
  await delay(900);let pic=await connection.call('Page.captureScreenshot');fs.writeFileSync(path.join(OUT,'idle.png'),Buffer.from(pic.data,'base64'));
  const before=launches.length;s=await key(13);assert.strictEqual(s.view,'home');await delay(100);assert.strictEqual(launches.length,before);
  await evaluate('(function(){MINIMAL.idle();return true;})()');await delay(600);
  await evaluate('(function(){var n=document.querySelector(".mi-idle");[200,260].forEach(function(x){var e=document.createEvent("MouseEvent");e.initMouseEvent("mousemove",true,true,window,0,0,0,x,200,false,false,false,false,0,null);n.dispatchEvent(e);});return true;})()');assert.strictEqual((await evaluate('MINIMAL.state()')).view,'home');
  await evaluate('(function(){MINIMAL.powerMenu();return true;})()');assert.strictEqual(await evaluate('stack[stack.length-1].items[0].label'),'Apagar');await key(27);
  await key(65);await key(37); // unrelated keyboard letters and focus boundary must be harmless
  await evaluate('(function(){document.querySelectorAll(".mi-favorites .mi-card")[2].click();return true;})()');await until(async()=>launches.some(a=>a.id==='com.disney.disneyplus-prod'),2000);
  const latency=await evaluate('(function(){var t=performance.now();for(var i=0;i<40;i++){var e=document.createEvent("Event");e.initEvent("keydown",true,true);Object.defineProperty(e,"keyCode",{value:i%2?37:39});document.dispatchEvent(e);}return {events:40,ms:performance.now()-t,errors:__testErrors.slice()};})()');assert.deepStrictEqual(latency.errors,[]);
  await key(36);pic=await connection.call('Page.captureScreenshot');fs.writeFileSync(path.join(OUT,'home.png'),Buffer.from(pic.data,'base64'));
  await key(40);await key(40);pic=await connection.call('Page.captureScreenshot');fs.writeFileSync(path.join(OUT,'apps.png'),Buffer.from(pic.data,'base64'));
  const gallery=await evaluate('(function(){return {bubbles:document.querySelectorAll(".mi-grid .mi-cozy-mark").length,vectors:document.querySelectorAll(".mi-grid .mi-cozy-mark svg").length,radius:getComputedStyle(document.querySelector(".mi-grid .mi-card")).borderTopLeftRadius,background:getComputedStyle(document.querySelector(".mi-gallery")).backgroundColor};})()');assert.strictEqual(gallery.bubbles,APP_COUNT);assert.strictEqual(gallery.vectors,4);assert.strictEqual(gallery.radius,'26px');assert(gallery.background.indexOf('rgba')===0);geometry.cozy.gallery=gallery;
  const gridRows=await evaluate('[].map.call(document.querySelectorAll(".mi-grid .mi-card"),function(n){return n.offsetTop;})');assert(gridRows.slice(0,6).every(y=>Math.abs(y-gridRows[0])<1));assert(gridRows[6]>gridRows[0]+100);gallery.columns=6;await key(40);assert.strictEqual((await evaluate('MINIMAL.state()')).gridFocus,6);await key(38);assert.strictEqual((await evaluate('MINIMAL.state()')).gridFocus,0);
  await key(35);s=await key(40);assert.strictEqual(s.gridFocus,APP_COUNT-1);const lastBox=await evaluate('(function(){var n=document.querySelectorAll(".mi-grid .mi-card")[MINIMAL.state().gridFocus].getBoundingClientRect(),r=document.querySelector(".mi-gallery-scroll").getBoundingClientRect();return {top:n.top,bottom:n.bottom,viewportTop:r.top,viewportBottom:r.bottom};})()');assert(lastBox.top>=lastBox.viewportTop&&lastBox.bottom<=lastBox.viewportBottom);
  await key(36);await key(40);await key(40);for(let i=0;i<5;i++)await key(39);assert.strictEqual((await evaluate('MINIMAL.state()')).gridFocus,5);await key(39);assert.strictEqual((await evaluate('MINIMAL.state()')).gridFocus,5);
  if(APP_COUNT===35){for(let i=0;i<4;i++)await key(40);assert.strictEqual((await evaluate('MINIMAL.state()')).gridFocus,29);await key(40);assert.strictEqual((await evaluate('MINIMAL.state()')).gridFocus,34);await key(40);assert.strictEqual((await evaluate('MINIMAL.state()')).gridFocus,34);await key(38);assert.strictEqual((await evaluate('MINIMAL.state()')).gridFocus,29);for(let i=0;i<5;i++)await key(37);await key(37);assert.strictEqual((await evaluate('MINIMAL.state()')).gridFocus,24);}
  await evaluate('(function(){return true;})()');geometry.cozy.fastStyles={before:fastBefore,after:fastAfter};
  await evaluate('(function(){document.querySelector(".mi-gallery-hint").click();return true;})()');assert.strictEqual((await evaluate('MINIMAL.state()')).view,'home');
  await evaluate('(function(){MINIMAL.select(false);return true;})()');
  assert.strictEqual(await evaluate('document.body.classList.contains("minimal-ui")'),false);
  await until(async()=>evaluate('document.querySelectorAll("#dock .tile").length===4'),2000);
  const classicBefore=await evaluate('c');await key(39);assert.notStrictEqual(await evaluate('c'),classicBefore);
  await evaluate('(function(){MINIMAL.select(true);return true;})()');assert.strictEqual(await evaluate('MINIMAL.enabled()'),true);
  assert(!requests.includes('/api/power/off'));
  results.push({minimalPassed:true,geometry,latency,launches:launches.slice(),checks:['favorite order and center','vertical favorites-HDMI-gallery and reverse, preserving favorite column','settings menu and escape','single Enter after menu','HDMI selection','idle and consumed wake key','mouse wake and gallery return','mouse activation','power confirmation cancelled without request','original interface restored and reselected','no power action','no script errors']});
  console.log(JSON.stringify(results[results.length-1]));
}
async function main() {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1:8765'), u = url.pathname;
    requests.push(u);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    if(req.method === 'OPTIONS') {res.writeHead(204); return res.end();}
    const name = /^\/(launcher|manager|picker|iptv)\.html$/.exec(u);
    if(name) {res.writeHead(200, {'content-type': 'text/html'}); return res.end(fs.readFileSync(path.join(PAGE_ROOT, pages[name[1]]), 'utf8').replace('<script>', (MINIMAL_CASE?PROBE.replace('locale:"en-GB"','locale:"es-ES"'):PROBE) + '<script>'));}
    if(u === '/qrcode.js') return res.end(fs.readFileSync(path.join(ROOT, 'third-party/qrcode-generator/qrcode.js')));
    if(u === '/cozy-wallpaper.jpg'){res.writeHead(200,{'content-type':'image/jpeg'});return res.end(fs.readFileSync(path.join(ROOT,'app/cozy-wallpaper.jpg')));}
    if(u === '/api/apps') return json(res, {apps, config: Object.assign({},fakeConfig,{theme:theme.resolved()}), usage: {}, version: '9.9.9'});
    if(u === '/api/launch'||u==='/api/config'){let b='';req.on('data',d=>b+=d);req.on('end',()=>{const v=JSON.parse(b||'{}');if(u==='/api/launch')launches.push(v);else fakeConfig=Object.assign({},v);json(res,{returnValue:true});});return;}
    if(u === '/api/inputs') return json(res, {devices: [{id:'HDMI_1', port:1, appId:'com.webos.app.hdmi1', label:'Test HDMI', connected:true},{id:'HDMI_2', port:2, appId:'com.webos.app.hdmi2', label:'HDMI 2', connected:false}]});
    if(u === '/api/manager/status') return json(res, golden['manager status'].body);
    if(u === '/api/live/status') return json(res, {configured:false});
    if(u === '/api/live/pair') return json(res, {url:'http://127.0.0.1:8765/test-pair',code:'TEST-ONLY'});
    if(u.indexOf('/api/theme/') === 0) return theme.handle(req,res,u,async()=>({}));
    if(u.indexOf('/icon/') === 0) {const file=path.join(STUDY,'minimal-icons',decodeURIComponent(u.slice(6))+'.png');if(MINIMAL_CASE&&fs.existsSync(file)){res.writeHead(200,{'content-type':'image/png'});return res.end(fs.readFileSync(file));}res.writeHead(200,{'content-type':'image/svg+xml'}); return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#347bb0"/></svg>');}
    return json(res, {returnValue:true});
  });
  await new Promise((res,rej)=>{server.on('error',rej);server.listen(8765,'127.0.0.1',res);});
  const debugPort = await new Promise((resolve,reject)=>{
    const reservation=require('net').createServer();reservation.on('error',reject);
    reservation.listen(0,'127.0.0.1',()=>{const port=reservation.address().port;reservation.close(()=>resolve(port));});
  });
  // This test owns a new, separate profile. No default-browser, account or user
  // profile settings. Chromium's sandbox remains enabled.
  const args = ['--remote-debugging-port='+debugPort,'--user-data-dir='+path.join(OUT,'profile'),'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions','--disable-gpu','--force-device-scale-factor=1','--enable-logging','--log-file='+path.join(OUT,'chrome.log'),'--window-position=-32000,-32000','--window-size=1920,1080','--proxy-server=127.0.0.1:9','--proxy-bypass-list=localhost;127.0.0.1','about:blank'];
  if(REFERENCE) args.unshift('--headless');
  else args[args.indexOf('--window-size=1920,1080')] = '--window-size=1938,1171';
  argsFile = path.join(OUT, 'launch.json');
  fs.writeFileSync(argsFile, JSON.stringify({exe:CHROME,args}));
  const launch = cp.spawn('powershell.exe', ['-NoProfile','-ExecutionPolicy','RemoteSigned','-File',path.join(__dirname,'launch-test-browser.ps1'),argsFile], {windowsHide:true,stdio:['ignore','pipe','pipe']});
  let launchOut = '', launchErr = '';
  launch.stdout.on('data', d=>launchOut+=d); launch.stderr.on('data',d=>launchErr+=d);
  await new Promise((res,rej)=>{launch.on('error',rej);launch.on('exit',code=>code===0?res():rej(new Error(launchErr)));});
  browser = JSON.parse(launchOut.trim());
  fs.writeFileSync(path.join(OUT,'browser-process.json'),JSON.stringify(browser));
  const version = await until(async()=>{const r=await fetch('http://127.0.0.1:'+debugPort+'/json/version');return r.json();},15000);
  if(!REFERENCE && !/38\./.test(version.Browser)) throw new Error('Wrong browser: '+JSON.stringify(version));
  fs.writeFileSync(path.join(OUT,'version.json'),JSON.stringify(version,null,2));
  const tabs = await (await fetch('http://127.0.0.1:'+debugPort+'/json')).json();
  fs.writeFileSync(path.join(OUT,'debug-targets.json'),JSON.stringify(tabs,null,2));
  const tab = tabs.filter(t=>t.type==='page')[0];
  connection = await connect(tab.webSocketDebuggerUrl);
  await connection.call('Page.enable',{},15000);
  await connection.call('Page.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false,fitWindow:false});
  for(const [name, count] of (MINIMAL_CASE?[['launcher',0]]:[['launcher',8],['manager',5],['picker',2],['iptv',0]])) {
    await connection.call('Page.navigate',{url:'http://127.0.0.1:8765/'+name+'.html'});
    await until(async()=>evaluate('document.readyState === "complete"'),10000);
    if(MINIMAL_CASE){await minimalChecks();continue;}
    if(count) await until(async()=>evaluate('document.querySelectorAll('+JSON.stringify(name==='launcher'?'.tile':name==='manager'?'.row':'.chip')+').length >= '+count),12000);
    await delay(500);
    const state = await evaluate('(function(){var e=document.querySelector(".tile,.row,.chip,#lv"),r=e?e.getBoundingClientRect():null;return {errors:window.__testErrors||[],legacy:!!window.CYTV_LEGACY38,legacyError:window.CYTV_LEGACY38&&CYTV_LEGACY38.lastError,rect:r?{x:r.left,y:r.top,w:r.width,h:r.height}:null,cssBytes:(document.getElementById("cytv-legacy38-style")||{}).textContent&&document.getElementById("cytv-legacy38-style").textContent.length,bg:getComputedStyle(document.body).backgroundColor};})()');
    state.name=name;results.push(state);
    console.log(JSON.stringify(state));
    const shot = await connection.call('Page.captureScreenshot');
    fs.writeFileSync(path.join(OUT,name+'.png'),Buffer.from(shot.data,'base64'));
    if(state.errors.length || state.legacyError || !state.rect || state.rect.w<30 || state.rect.h<20) throw new Error('Browser acceptance failed: '+name);
    if(name==='launcher') {
      const ids=fs.readdirSync(path.join(ROOT,'themes')).filter(id=>fs.existsSync(path.join(ROOT,'themes',id,'theme.json')));
      for(const id of ids) {
        config.update('test',c=>{c.theme={id};});
        const resolved=theme.resolved();
        await evaluate('(function(){applyTheme('+JSON.stringify(resolved)+');rebuild(false);return true;})()');
        await delay(300);
        const measured=await evaluate('(function(){var t=performance.now();if(window.CYTV_LEGACY38)CYTV_LEGACY38.refresh();var ms=performance.now()-t;var d=document.querySelector("#dock .tile"),r=d.getBoundingClientRect();var grid=Array.prototype.slice.call(document.querySelectorAll("#grid>.tile")).map(function(e){var b=e.getBoundingClientRect();return {x:b.left,y:b.top,w:b.width,h:b.height};});return {themeError:window.CYTV_LEGACY38&&CYTV_LEGACY38.lastError,errors:__testErrors.slice(),refreshMs:ms,rect:{x:r.left,y:r.top,w:r.width,h:r.height},grid:grid,viewport:{w:innerWidth,h:innerHeight},cssBytes:(document.getElementById("cytv-legacy38-style")||{}).textContent&&document.getElementById("cytv-legacy38-style").textContent.length};})()');
        measured.theme=id;results.push(measured);console.log(JSON.stringify(measured));
        const pic=await connection.call('Page.captureScreenshot');fs.writeFileSync(path.join(OUT,'theme-'+id+'.png'),Buffer.from(pic.data,'base64'));
        if(measured.themeError||measured.errors.length||measured.rect.w<30) throw new Error('Theme failed: '+id);
      }
      const keys=await evaluate('(function(){var before={r:r,c:c};var e=document.createEvent("Event");e.initEvent("keydown",true,true);Object.defineProperty(e,"keyCode",{value:39});document.dispatchEvent(e);var afterRight={r:r,c:c};e=document.createEvent("Event");e.initEvent("keydown",true,true);Object.defineProperty(e,"keyCode",{value:40});document.dispatchEvent(e);return {before:before,afterRight:afterRight,afterDown:{r:r,c:c}};})()');
      results.push({navigation:keys});
      if(keys.afterRight.c===keys.before.c || keys.afterDown.r===keys.afterRight.r) throw new Error('Remote navigation did not change focus');
    }
  }
}
main().catch(e=>{results.push({error:String(e.stack||e)});console.error(e);process.exitCode=1;}).finally(async()=>{
  if(connection) {
    try {await connection.call('Page.navigate',{url:'chrome://quit'});} catch (_) {}
    connection.ws.close();
  }
  await delay(1500);
  let cleanup;
  if(argsFile) {
    try {
      cleanup=await new Promise((res,rej)=>cp.execFile('powershell.exe',['-NoProfile','-ExecutionPolicy','RemoteSigned','-File',path.join(__dirname,'cleanup-test-browser.ps1'),argsFile],{windowsHide:true,timeout:15000},(e,o,s)=>e?rej(new Error(s||String(e))):res(JSON.parse(o))));
    } catch(e) {cleanup={error:String(e)};process.exitCode=1;}
  }
  fs.writeFileSync(path.join(OUT,'result.json'),JSON.stringify({results,requests,cleanup,launched:browser,tvAccess:false,reference:REFERENCE},null,2));
  if(server) server.close();
  console.log('evidence: '+OUT);
});
