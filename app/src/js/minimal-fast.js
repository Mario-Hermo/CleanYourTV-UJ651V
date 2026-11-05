/* Keep webOS3's variable resolver for themes, without running it for native cozy focus rules. */
var MINIMAL_FAST = (function () {
  var installed=false, enabled=null, metrics={installed:false,refreshes:0,ignored:0,error:''};
  function parentWithId(el,id) { while(el&&el.nodeType===1){if(el.id===id)return true;el=el.parentNode;}return false; }
  function onlyClasses(before,after,allowed) {
    var a=(before||'').split(/\s+/),b=(after||'').split(/\s+/),changed=a.filter(function(x){return x&&b.indexOf(x)<0;}).concat(b.filter(function(x){return x&&a.indexOf(x)<0;}));
    return changed.every(function(x){return allowed.indexOf(x)>=0;});
  }
  function nativeMutation(m) {
    var el=m.target.nodeType===1?m.target:m.target.parentNode;
    if(m.type==='attributes'&&m.oldValue===el.getAttribute(m.attributeName))return true;
    if(!enabled()||!el)return false;
    if(m.type==='attributes'&&m.attributeName==='aria-hidden'&&parentWithId(el,'minimal-home'))return true;
    if(m.type==='attributes'&&m.attributeName==='class'){
      if(parentWithId(el,'minimal-home'))return onlyClasses(m.oldValue,el.getAttribute('class'),['mi-focus','mi-gallery-on','mi-idle-on','mi-settings-visible']);
      if(parentWithId(el,'ov'))return onlyClasses(m.oldValue,el.getAttribute('class'),['f']);
    }
    if(parentWithId(el,'minimal-home')&&/\bmi-(time|date|idle-clock)\b/.test(el.className||'')){
      if(m.type==='characterData')return true;
      if(m.type==='childList')return [].every.call(m.addedNodes,function(n){return n.nodeType===3;})&&[].every.call(m.removedNodes,function(n){return n.nodeType===3;});
    }
    return false;
  }
  function install(isEnabled) {
    if(installed||!window.CYTV_LEGACY38||!window.MutationObserver)return;
    var api=CYTV_LEGACY38,proto=MutationObserver.prototype,observe=proto.observe,found=null,options=null,delegate=null,timer=0,disconnect;
    enabled=isEnabled;
    try{
      // Capture only the observer synchronously reattached by this resolver's refresh.
      // No other page or native input process is intercepted.
      proto.observe=function(target,opts){if(target===document.documentElement){if(found&&found!==this)throw Error('Ambiguous resolver observer');found=this;options=opts;}return observe.call(this,target,opts);};
      try{api.refresh();}finally{proto.observe=observe;}
      if(!found||api.lastError)throw Error(api.lastError||'Resolver observer missing');
      disconnect=found.disconnect;
      delegate=new MutationObserver(function(records){
        var needed=false;for(var i=0;i<records.length;i++){if(nativeMutation(records[i]))metrics.ignored++;else needed=true;}
        if(needed&&!timer)timer=setTimeout(function(){timer=0;metrics.refreshes++;api.refresh();},16);
      });
      found.disconnect=function(){delegate.disconnect();return disconnect.call(found);};
      found.observe=function(target,opts){
        if(enabled()&&target===document.documentElement)delegate.observe(target,{subtree:true,childList:true,characterData:true,attributes:true,attributeOldValue:true});
        else observe.call(found,target,opts);
      };
      found.disconnect();found.observe(document.documentElement,options);installed=true;metrics.installed=true;
    }catch(e){
      proto.observe=observe;if(delegate)delegate.disconnect();
      if(found&&disconnect){found.disconnect=disconnect;found.observe=observe;observe.call(found,document.documentElement,options);}
      metrics.error=String(e.message||e);if(window.console)console.warn('minimal styles: '+metrics.error);
    }
  }
  return {install:install,stats:function(){return {installed:metrics.installed,refreshes:metrics.refreshes,ignored:metrics.ignored,error:metrics.error};}};
})();
