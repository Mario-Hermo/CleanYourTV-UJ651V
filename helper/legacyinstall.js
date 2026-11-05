'use strict';
// Own boot hook and reversible removal for the UJ651V payload. Never invokes the modern bootstrap.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
const P=require('./paths'),target=require('./legacytarget');
const D='/media/developer/cleanyourtv',HOOK='/var/lib/webosbrew/init.d/10-cleanyourtv-legacy';
function exec(file,args){const r=cp.spawnSync(file,args,{encoding:'utf8',timeout:20000,env:P.ENV,stdio:['ignore','pipe','pipe']});if(r.error||r.status!==0)throw new Error(file+': '+String(r.stderr||r.error));return r;}
function owner(){
  if(!P.LEGACY_UJ651V||P.D!==D||process.getuid()!==0)throw new Error('Owned legacy installation required');
  target.identity(exec);
  if(fs.lstatSync(D).isSymbolicLink())throw new Error('Installation must not be a symlink');
  const id=fs.readFileSync(D+'/LEGACY_OWNER','utf8').trim();if(!/^[a-f0-9]{24}$/.test(id))throw new Error('Invalid owner');return id;
}
function verifyFiles(manifest,read){
  if(!manifest||manifest.format!==1||!manifest.files||!Object.keys(manifest.files).length)throw new Error('Invalid installation manifest');
  for(const name of Object.keys(manifest.files)){
    if(!name||name[0]==='/'||name.indexOf('\\')>=0||name.split('/').some(p=>p==='..'||p==='.'||!p))throw new Error('Unsafe manifest path');
    if(!/^[a-f0-9]{64}$/.test(manifest.files[name])||crypto.createHash('sha256').update(read(name)).digest('hex')!==manifest.files[name])throw new Error('Installation integrity mismatch: '+name);
  }
}
function hookOwned(){
  try{const s=fs.lstatSync(HOOK);if(!s.isSymbolicLink()||fs.readlinkSync(HOOK)!==D+'/10-cleanyourtv-legacy')throw new Error('Foreign boot hook retained');return true;}
  catch(e){if(e.code==='ENOENT')return false;throw e;}
}
async function main(){
  const id=owner(),action=process.argv[2];
  if(['verify','enable-boot','disable-boot','remove'].indexOf(action)<0)throw new Error('Expected verify, enable-boot, disable-boot or remove');
  if(action==='verify'||action==='enable-boot'){
    verifyFiles(JSON.parse(fs.readFileSync(D+'/legacy-manifest.json','utf8')),name=>{
      const file=D+'/'+name;if(fs.lstatSync(file).isSymbolicLink()||fs.realpathSync(file).indexOf(D+'/')!==0)throw new Error('Foreign source link');return fs.readFileSync(file);
    });
    if(action==='verify'){console.log('Owned installation hashes verified');return;}
    fs.writeFileSync(D+'/LEGACY_BOOT_ENABLED',id,{mode:0o600});if(!hookOwned())fs.symlinkSync(D+'/10-cleanyourtv-legacy',HOOK);
    console.log('Owned Homebrew startup hook enabled; no reboot requested');return;
  }
  if(hookOwned())fs.unlinkSync(HOOK);
  if(fs.existsSync(D+'/LEGACY_BOOT_ENABLED'))fs.unlinkSync(D+'/LEGACY_BOOT_ENABLED');
  if(action==='disable-boot'){console.log('Owned startup hook removed');return;}
  // Uninstall keeps user data as a renamed backup, not a recursive deletion.
  const backup='/media/developer/cleanyourtv-removed-'+id;
  if(fs.existsSync(backup))throw new Error('Removal backup already exists; retained for inspection');
  exec(process.execPath,[D+'/legacyboot.js','stop']);
  for(let i=0;i<80;i++){
    let state=null;try{state=JSON.parse(fs.readFileSync('/tmp/cleanyourtv-legacy-supervisor.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    if(!state||(state.owner===id&&state.closed&&state.helperAbsent))break;
    if(i===79)throw new Error('Service stop not verified; installation retained');
    await new Promise(r=>setTimeout(r,250));
  }
  exec(process.execPath,[D+'/legacydebloat.js','undo']);
  // The normal apps stay removable through LG's app list; keep their registered files intact.
  fs.renameSync(D,backup);
  console.log('Stock Home and startup restored; user data retained at '+backup+'. Remove normal CleanYourTV apps through LG if wanted.');
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={verifyFiles};
