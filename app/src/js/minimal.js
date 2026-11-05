/* Optional minimal profile: remote, keyboard and mouse share one focus model. ES5. */
var MINIMAL = (function () {
  var root = null, view = 'home', focus = 0, lastFavorite = 0, gridFocus = 0, port = 0, devices = [], favorites = [], gallery = [],
    signature = '', inputStamp = 0, pendingInputs = false, enterHeld = false, pointerX = -1, pointerY = -1, idleTimer = 0, idleAt = 0, idleX = -1, idleY = -1,
    favoriteNodes=[],galleryNodes=[],focusedNode=null,gridColumn=0,gridMetrics=null,scroll=null,gridScroll=0,portStamp='';
  var favoriteSpecs = [
    {ids:['netflix'],label:'Netflix'}, {ids:['amazon','com.amazon.amazonvideo'],label:'Prime Video'},
    {ids:['com.disney.disneyplus-prod','com.disney.disneyplus'],label:'Disney+'}, {ids:['youtube.leanback.v4'],label:'YouTube'}
  ];
  function enabled() { return cfg.interface === 'minimal-apple'; }
  function make(tag, cls, text) { var n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n; }
  function absorb(e) { e.preventDefault(); e.stopImmediatePropagation(); }
  function click(n, fn) { n.addEventListener('click',function(e){if(view==='idle'){showHome();return;}fn(e);}); }
  function activate(id) { if(!id){toast('Esta aplicación no está instalada',true);return;}launch(id); }
  function pointerIntent(e) {
    if(Date.now()-lastKey<1500){pointerX=e.clientX;pointerY=e.clientY;return false;}
    if(pointerX<0){pointerX=e.clientX;pointerY=e.clientY;return false;}
    if(Math.abs(e.clientX-pointerX)+Math.abs(e.clientY-pointerY)<24)return false;
    pointerX=e.clientX;pointerY=e.clientY;return true;
  }
  function cozyMark(index) {
    var marks=[
      '<path d="M10 7v26M30 7v26M10 7l20 26" stroke-width="5"/>',
      '<path d="M8 28c7 5 17 5 24-1M27 26l6 1-2 6"/><text x="20" y="21" text-anchor="middle" fill="currentColor" stroke="none" font-family="Arial,sans-serif" font-size="12" font-weight="bold">prime</text>',
      '<path d="M9 11c8-8 21-6 25 3M14 13v19M14 13c20-2 20 20 0 19M31 21v8M27 25h8"/>',
      '<rect x="5" y="10" width="30" height="22" rx="7"/><path d="M17 16l10 5-10 5z" fill="currentColor" stroke="none"/>'
    ];
    var boxes=['7 4 26 32','5 8 32 28','6 4 32 30','3 8 34 26'];
    return '<svg viewBox="'+boxes[index]+'" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+marks[index]+'</svg>';
  }
  function card(app, label, index, isGrid) {
    var n=make('button','mi-card'+(!app?' mi-unavailable':''));n.type='button';n.setAttribute('aria-label',label);
    var brand=isGrid?-1:index;
    if(isGrid&&app)favoriteSpecs.some(function(spec,i){if(spec.ids.indexOf(app.id)>=0){brand=i;return true;}return false;});
    var mark=make('span','mi-cozy-mark'+(brand>=0?' mi-brand-'+brand:' mi-other-mark'));
    if(brand>=0)mark.innerHTML=cozyMark(brand);
    else if(app){var im=make('img','');im.alt='';im.src=API+'/icon/'+encodeURIComponent(app.id);im.onerror=function(){im.style.display='none';};mark.appendChild(im);}
    n.appendChild(mark);
    n.appendChild(make('span','mi-label',label));
    click(n,function(){if(isGrid){gridFocus=index;gridColumn=index%6;}else focus=index;paintFocus();activate(app&&app.id);});
    n.addEventListener('mousemove',function(e){
      if(!pointerIntent(e))return;
      if(isGrid){gridFocus=index;gridColumn=index%6;}else focus=index;paintFocus();resetIdleTimer();
    });
    return n;
  }
  function mount() {
    if(root)return;
    MINIMAL_FAST.install(enabled);
    root=make('div','');root.id='minimal-home';
    root.innerHTML='<div class="mi-backdrop"></div><div class="mi-main"><div class="mi-clock"><div class="mi-time"></div><div class="mi-date"></div></div><div class="mi-favorites"></div><div class="mi-hdmi"><button class="mi-prev" aria-label="HDMI anterior">&#8249;</button><button class="mi-port"></button><button class="mi-next" aria-label="HDMI siguiente">&#8250;</button><div class="mi-port-status"></div></div><div class="mi-settings-hit"></div><button class="mi-settings" aria-label="Ajustes"></button><button class="mi-down">&#8964; Aplicaciones</button></div><div class="mi-gallery"><h1>Aplicaciones</h1><div class="mi-gallery-hint">Esc / Atrás para volver</div><div class="mi-gallery-scroll"><div class="mi-grid"></div></div></div><div class="mi-idle"><div class="mi-idle-clock"></div></div>';
    document.body.appendChild(root);root.querySelector('.mi-settings').innerHTML=svg('settings');
    root.querySelector('.mi-gallery').setAttribute('aria-hidden','true');
    root.querySelector('.mi-down').textContent='\u2193 Aplicaciones';
    root.querySelector('.mi-gallery-hint').textContent='\u2190 Inicio';root.querySelector('.mi-gallery-hint').style.cursor='pointer';
    click(root.querySelector('.mi-gallery-hint'),showHome);
    click(root.querySelector('.mi-settings'),settings);click(root.querySelector('.mi-down'),showGallery);
    click(root.querySelector('.mi-port'),function(){focus=4;paintFocus();switchInput();});
    click(root.querySelector('.mi-prev'),function(){cyclePort(-1);});click(root.querySelector('.mi-next'),function(){cyclePort(1);});
    scroll=root.querySelector('.mi-gallery-scroll');
    scroll.addEventListener('scroll',function(){gridScroll=scroll.scrollTop;});
    root.querySelector('.mi-port').addEventListener('mousemove',function(e){if(view==='home'&&pointerIntent(e)){focus=4;paintFocus();resetIdleTimer();}});
    root.querySelector('.mi-settings-hit').addEventListener('mousemove',function(e){if(view==='home'&&pointerIntent(e))root.classList.add('mi-settings-visible');});
    root.querySelector('.mi-idle').addEventListener('click',function(){showHome();});
    root.querySelector('.mi-idle').addEventListener('mousemove',function(e){if(view!=='idle'||Date.now()-idleAt<500)return;if(idleX<0){idleX=e.clientX;idleY=e.clientY;return;}if(Math.abs(e.clientX-idleX)+Math.abs(e.clientY-idleY)>=30)showHome();});
    root.addEventListener('wheel',function(e){if(!enabled()||stack.length)return;if(view==='idle'){showHome();absorb(e);return;}if(view==='home'){if(e.deltaY>0)showGallery();absorb(e);}else if(e.deltaY<0&&root.querySelector('.mi-gallery-scroll').scrollTop===0){showHome();absorb(e);}else{resetIdleTimer();e.stopPropagation();}},true);
    tick();setInterval(tick,1000);
  }
  function tick() {
    if(!root)return;var d=new Date(),time=('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2),date='';
    try{date=d.toLocaleDateString(LOC||'es-ES',{weekday:'long',day:'numeric',month:'long'});}catch(e){date=d.getDate()+'/'+(d.getMonth()+1);}
    var values=[['.mi-time',time],['.mi-date',date],['.mi-idle-clock',time]];
    values.forEach(function(v){var n=root.querySelector(v[0]);if(n.textContent!==v[1])n.textContent=v[1];});
  }
  function rebuild() {
    mount();document.body.classList.add('minimal-ui');
    var sig=JSON.stringify(apps.map(function(a){return [a.id,a.title,a.iv||0];}));
    if(sig!==signature){
      signature=sig;var dock=root.querySelector('.mi-favorites'),grid=root.querySelector('.mi-grid');dock.textContent='';grid.textContent='';favorites=[];gallery=[];favoriteNodes=[];galleryNodes=[];focusedNode=null;gridMetrics=null;
      favoriteSpecs.forEach(function(spec,i){var a=null;apps.some(function(x){if(spec.ids.indexOf(x.id)>=0){a=x;return true;}return false;});favorites.push(a);var n=card(a,spec.label,i,false);favoriteNodes.push(n);dock.appendChild(n);});
      apps.filter(function(a){return !a.sys&&a.id!=='__live'&&!a.input;}).sort(function(a,b){return a.title.localeCompare(b.title);}).forEach(function(a,i){gallery.push(a);var n=card(a,a.title,i,true);galleryNodes.push(n);grid.appendChild(n);});
    }
    paintPort();paintFocus();readInputs();resetIdleTimer();
  }
  function sync() { if(enabled())return rebuild();document.body.classList.remove('minimal-ui');if(root){root.className='';view='home';}clearTimeout(idleTimer); }
  function readInputs() {
    if(pendingInputs||Date.now()-inputStamp<30000)return;pendingInputs=true;
    api('/api/inputs').then(function(r){pendingInputs=false;inputStamp=Date.now();devices=(r.devices||[]).filter(function(d){return !d.tuner&&(/^HDMI_/i.test(d.id||'')||/hdmi/i.test(d.appId||''));}).sort(function(a,b){return (a.port||0)-(b.port||0);});if(port>=devices.length)port=0;paintPort();},function(){pendingInputs=false;});
  }
  function paintPort() {
    if(!root)return;var d=devices[port],label=d?((cfg.inputLabels||{})[d.id]||d.label||d.name||('HDMI '+(d.port||port+1))):'HDMI';
    var stamp=label+'|'+port+'|'+devices.length+'|'+(d&&d.connected);if(stamp===portStamp)return;portStamp=stamp;
    var n=root.querySelector('.mi-port');n.innerHTML=svg('hdmi');n.appendChild(document.createTextNode(label));
    n.setAttribute('aria-label','Seleccionar '+label);root.querySelector('.mi-port-status').textContent=d?((port+1)+' / '+devices.length+(d.connected===false?' · Sin señal':'')):'Cargando entradas…';
  }
  function cyclePort(delta) { if(view==='idle'){showHome();return;}if(!devices.length)return;focus=4;port=(port+delta+devices.length)%devices.length;paintPort();paintFocus();resetIdleTimer(); }
  function switchInput() { var d=devices[port];if(d&&d.appId)activate(d.appId);else toast('No hay una entrada HDMI disponible',true); }
  function paintFocus() {
    if(!root)return;
    if(view==='home'&&focus>=0&&focus<4)lastFavorite=focus;
    var n;
    if(view==='gallery'){gridFocus=Math.max(0,Math.min(gridFocus,galleryNodes.length-1));n=galleryNodes[gridFocus];}
    else if(focus===-1)n=root.querySelector('.mi-settings');else if(focus===4)n=root.querySelector('.mi-port');else n=favoriteNodes[focus];
    if(view==='gallery'&&n){
      if(!gridMetrics){var first=galleryNodes[0],second=galleryNodes[6];gridMetrics={top:first.offsetTop,step:second?second.offsetTop-first.offsetTop:first.offsetHeight+28,height:first.offsetHeight,viewport:scroll.clientHeight};}
      var top=gridMetrics.top+Math.floor(gridFocus/6)*gridMetrics.step,bottom=top+gridMetrics.height,wanted=gridScroll;
      if(top<gridScroll)wanted=Math.max(0,top-10);else if(bottom>gridScroll+gridMetrics.viewport)wanted=bottom-gridMetrics.viewport+10;
      if(wanted!==gridScroll){gridScroll=wanted;scroll.scrollTop=wanted;}
    }
    if(n!==focusedNode){if(focusedNode)focusedNode.classList.remove('mi-focus');if(n)n.classList.add('mi-focus');focusedNode=n;}
  }
  function showHome(target) { mount();view='home';enterHeld=false;root.classList.remove('mi-idle-on');root.classList.remove('mi-gallery-on');root.querySelector('.mi-gallery').setAttribute('aria-hidden','true');focus=target===4?4:0;root.classList.remove('mi-settings-visible');paintFocus();tick();resetIdleTimer(); }
  function showGallery() { if(!enabled())return;view='gallery';root.classList.remove('mi-idle-on');root.classList.add('mi-gallery-on');root.querySelector('.mi-gallery').setAttribute('aria-hidden','false');gridFocus=0;gridColumn=0;gridMetrics=null;paintFocus();resetIdleTimer(); }
  function idle() { if(!enabled())return;closeMenus();view='idle';enterHeld=false;idleAt=Date.now();idleX=-1;idleY=-1;root.classList.remove('mi-gallery-on');root.classList.add('mi-idle-on');root.querySelector('.mi-gallery').setAttribute('aria-hidden','true');tick();clearTimeout(idleTimer); }
  function resetIdleTimer() { clearTimeout(idleTimer);if(!enabled()||view==='idle'||document.hidden)return;idleTimer=setTimeout(function(){if(!document.hidden&&!stack.length)idle();},300000); }
  function settings() {
    if(view==='idle'){showHome();return;}
    openMenu('Ajustes',[
      {label:'Reposo',sub:'Pantalla negra y reloj tenue. La pantalla permanece encendida.',icon:'clock',fn:idle},
      {label:'Imagen y sonido',icon:'settings',fn:function(){launch('com.palm.app.settings');}},
      {label:'Opciones de CleanYourTV',icon:'settings',fn:function(){launch('com.cleanyourtv.manager');}},
      {label:'Inicio original de CleanYourTV',icon:'home',fn:function(){select(false);}},
      {label:'Apagar',icon:'power',fn:powerMenu}
    ]);
  }
  function powerMenu() {
    openMenu('¿Apagar la TV?',[
      {label:'Apagar',sub:'Volverás a encenderla con el mando.',icon:'power',fn:function(){api('/api/power/off',{}).then(function(r){if(r.returnValue===false)toast(r.errorText||'No se pudo apagar la TV',true);},function(){toast('No se pudo apagar la TV',true);});}},
      {label:'Cancelar',fn:backMenu}
    ]);
  }
  function select(on) { cfg.interface=on?'minimal-apple':'classic';saveCfg();sync();if(on)showHome(); }
  function key(e) {
    if(!enabled())return;
    var k=e.keyCode;if(view==='idle'){if(k===16||k===17||k===18)return;showHome();absorb(e);return;}
    if(stack.length||LIVE.on||PAGER.on)return;
    if([9,13,27,32,35,36,37,38,39,40,461,8].indexOf(k)<0)return;
    lastKey=Date.now();resetIdleTimer();absorb(e);
    if(k===27||k===461||k===8||k===36){showHome();return;}
    if(k===35){showGallery();if(gallery.length)gridFocus=gallery.length-1;gridColumn=gridFocus%6;paintFocus();return;}
    if(k===13||k===32){if(enterHeld||e.repeat)return;enterHeld=true;if(view==='gallery'){if(gallery[gridFocus])activate(gallery[gridFocus].id);}else if(focus===-1)settings();else if(focus===4)switchInput();else activate(favorites[focus]&&favorites[focus].id);return;}
    if(view==='gallery'){
      if(k===38&&gridFocus<6){showHome(4);return;}
      var row=Math.floor(gridFocus/6),lastRow=Math.floor((gallery.length-1)/6),col=gridFocus%6;
      if(k===37&&col>0){gridFocus--;gridColumn=gridFocus%6;}
      else if(k===39&&col<5&&gridFocus+1<gallery.length){gridFocus++;gridColumn=gridFocus%6;}
      else if(k===38&&row>0)gridFocus=Math.min(gallery.length-1,(row-1)*6+gridColumn);
      else if(k===40&&row<lastRow)gridFocus=Math.min(gallery.length-1,(row+1)*6+gridColumn);
      else if(k===9){gridFocus=Math.max(0,Math.min(gallery.length-1,gridFocus+(e.shiftKey?-1:1)));gridColumn=gridFocus%6;}
      paintFocus();return;
    }
    if(k===38){if(focus===4){focus=lastFavorite;}else{focus=-1;root.classList.add('mi-settings-visible');}}
    else if(k===40){if(focus===-1){focus=lastFavorite;root.classList.remove('mi-settings-visible');}else if(focus===4){showGallery();return;}else{focus=4;}}
    else if(k===9){focus=(focus+(e.shiftKey?-1:1)+5)%5;}
    else if(k===37){if(focus===4&&port>0){cyclePort(-1);return;}focus=Math.max(0,focus-1);}
    else if(k===39){if(focus===4){cyclePort(1);return;}focus=Math.min(4,focus+1);}
    paintFocus();
  }
  document.addEventListener('keydown',key,true);
  document.addEventListener('keyup',function(e){if(enabled()&&(e.keyCode===13||e.keyCode===32))enterHeld=false;},true);
  document.addEventListener('webOSRelaunch',function(){if(enabled())showHome();});
  document.addEventListener('visibilitychange',function(){enterHeld=false;if(document.hidden)clearTimeout(idleTimer);else if(enabled())showHome();});
  window.addEventListener('resize',function(){gridMetrics=null;});
  return {enabled:enabled,rebuild:rebuild,sync:sync,home:showHome,idle:idle,select:select,powerMenu:powerMenu,state:function(){return {view:view,focus:focus,gridFocus:gridFocus,port:port,devices:devices.length};}};
})();
