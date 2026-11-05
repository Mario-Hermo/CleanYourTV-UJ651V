"""Build an explicit UJ651V payload and normal manager/picker/notify package.

No downloads, publishing, TV changes, or removal of existing output directories.
The original bootstrap/preflight is preserved; this payload uses its own gated entry.
"""
from pathlib import Path
import argparse,gzip,hashlib,io,json,re,tarfile
p=argparse.ArgumentParser();p.add_argument('--runtime',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--split-apps',action='store_true')
a=p.parse_args();port=Path(__file__).resolve().parents[1];dest=a.out.resolve()
if dest.exists() and any(dest.iterdir()):raise SystemExit('Output is not empty; preserve it and choose another directory')
dest.mkdir(parents=True,exist_ok=True)
version=re.search(r"const VERSION = '([^']+)'",(port/'helper/helper.js').read_text()).group(1)
files={};modes={}
def add(name,body,mode=0o600):
    assert name not in files and not name.startswith('/') and '..' not in name.split('/')
    files[name]=body;modes[name]=mode
def tree(source,prefix,skip=()):
    for f in sorted(source.rglob('*')):
        if f.is_file() and not f.is_symlink() and not any(x in skip for x in f.relative_to(source).parts):
            add((prefix+'/'+f.relative_to(source).as_posix()).strip('/'),f.read_bytes())
tree(port/'helper','',('src',));tree(port/'themes','themes');tree(port/'i18n','i18n',('README.md',));tree(port/'app','app',('src',))
tree(a.runtime.resolve(),'runtime')
for name in ['runtime/bin/node','runtime/bin/node.bin','runtime/lib/ld-linux-armhf.so.3']:modes[name]=0o700
tree(port/'scripts','upstream-scripts');add('upstream-scripts/uninstall.sh',(port/'uninstall.sh').read_bytes())
for f in (port/'scripts').iterdir():
    if not f.is_file() or f.name in ('bootstrap.sh','10-cleanyourtv-home','15-cleanyourtv-debloat','watchdog.sh','undo-home.sh','debloat-stop.sh','debloat-undo.sh','stage-home.sh','reload-home.sh','after-sam.sh'):continue
    body=f.read_bytes().replace(b'\r\n',b'\n')
    # Scripts explicitly reset PATH; keep their private Node first only for this payload.
    body=body.replace(b'export PATH=/usr/bin:/usr/sbin:/bin:/sbin:$PATH',b'export PATH=/media/developer/cleanyourtv/runtime/bin:/usr/bin:/usr/sbin:/bin:/sbin:$PATH')
    add(f.name,body,0o700)
header='#!/bin/sh\nL=/media/developer/cleanyourtv\nexport CYTV_DIR="$L" CYTV_SERVICE_DIR="$L/package" CYTV_LEGACY_UJ651V=1\n'
def shim(name,body):add(name,(header+body+'\n').encode(),0o700)
shim('debloat-stop.sh','exec "$L/runtime/bin/node" "$L/legacydebloat.js" apply "$@"')
shim('debloat-undo.sh','exec "$L/runtime/bin/node" "$L/legacydebloat.js" undo "$@"')
shim('watchdog.sh','exec "$L/runtime/bin/node" "$L/legacyboot.js" start')
shim('undo-home.sh','"$L/runtime/bin/node" "$L/legacyinstall.js" disable-boot && exec "$L/runtime/bin/node" "$L/legacyboot.js" stop')
shim('uninstall.sh','exec "$L/runtime/bin/node" "$L/legacyinstall.js" remove')
shim('10-cleanyourtv-home','exec "$L/runtime/bin/node" "$L/legacyboot.js" start')
add('10-cleanyourtv-legacy',(port/'compat/10-cleanyourtv-legacy').read_bytes().replace(b'\r\n',b'\n'),0o700)
add('legacy-start.sh',(port/'compat/legacy-start.sh').read_bytes().replace(b'\r\n',b'\n'),0o700)
tree(port/'third-party/inputhook','inputhook');modes['inputhook/ezinject']=0o700
add('licenses/LICENSE',(port/'LICENSE').read_bytes());add('licenses/THIRD-PARTY.md',(port/'THIRD-PARTY.md').read_bytes())
add('compat.json',(port/'compat.json').read_bytes())
config={'options':{'debloat':False,'inputKey':False,'liveTv':False,'tuner':False,'volumeTheme':'system','closePreloaded':[]},'keys':{'input':'','home':'','voice':'','guide':'','learned':False},'voice':{'enabled':False},'notifyApi':{'enabled':False}}
add('config.initial.json',json.dumps(config,indent=2).encode())
manifest={'format':1,'target':{'model':'49UJ651V-ZA','firmware':'06.10.75','sdk':'3.9.0','otaId':'HE_DTV_W17P_AFADABAA'},'service':version,'base_commit':'69669dcb387c39525ac668d7ae8f7c540c2cd24b','files':{n:hashlib.sha256(b).hexdigest() for n,b in sorted(files.items()) if not n.startswith('themes/')},'initial_theme_data':{n:hashlib.sha256(b).hexdigest() for n,b in sorted(files.items()) if n.startswith('themes/')}}
add('legacy-manifest.json',json.dumps(manifest,indent=2).encode())
def tgz(items,permissions=None):
    b=io.BytesIO()
    with gzip.GzipFile(fileobj=b,mode='wb',mtime=0) as z:
        with tarfile.open(fileobj=z,mode='w',format=tarfile.GNU_FORMAT) as t:
            dirs=set()
            for n in items:
                q=Path(n).parent
                while str(q) not in ('.','/'):
                    dirs.add(q.as_posix());q=q.parent
            for n in sorted(dirs,key=lambda x:(x.count('/'),x)):
                e=tarfile.TarInfo(n);e.type=tarfile.DIRTYPE;e.mode=0o755;e.mtime=1762128000;t.addfile(e)
            for n,body in sorted(items.items()):
                e=tarfile.TarInfo(n);e.size=len(body);e.mode=(permissions or {}).get(n,0o644);e.mtime=1762128000;t.addfile(e,io.BytesIO(body))
    return b.getvalue()
payload=tgz(files,modes);payload_name='cleanyourtv-uj651v-payload.tar.gz';(dest/payload_name).write_bytes(payload)
apps={}
for app_id,src in [('com.cleanyourtv.manager','manager/app'),('com.cleanyourtv.picker','picker/app'),('com.cleanyourtv.notify','notify/app')]:
    for f in sorted((port/src).rglob('*')):
        if f.is_file():apps['usr/palm/applications/'+app_id+'/'+f.relative_to(port/src).as_posix()]=f.read_bytes()
    mpath='usr/palm/applications/'+app_id+'/appinfo.json';info=json.loads(apps[mpath]);assert info['id']==app_id
    if app_id=='com.cleanyourtv.manager':info['version']=version
    if app_id=='com.cleanyourtv.notify':info['defaultWindowType']='overlay'
    apps[mpath]=json.dumps(info).encode()
apps['usr/palm/applications/com.cleanyourtv.manager/qrcode.js']=(port/'third-party/qrcode-generator/qrcode.js').read_bytes()
apps['usr/palm/packages/com.cleanyourtv.manager/packageinfo.json']=json.dumps({'id':'com.cleanyourtv.manager','version':version,'app':'com.cleanyourtv.manager'}).encode()
control=('Package: com.cleanyourtv.manager\nVersion: '+version+'\nSection: misc\nPriority: optional\nArchitecture: all\nInstalled-Size: '+str(sum(map(len,apps.values()))+4096)+'\nMaintainer: N/A <nobody@example.com>\nDescription: CleanYourTV adapted UJ651V manager\nwebOS-Package-Format-Version: 2\nwebOS-Packager-Version: x.y.x\n').encode()
ipk=b'!<arch>\n'
for n,body in [('debian-binary',b'2.0\n'),('control.tar.gz',tgz({'control':control})),('data.tar.gz',tgz(apps))]:
    ipk+=('%-16s%-12d%-6d%-6d%-8s%-10d`\n'%(n+'/',0,0,0,'100644',len(body))).encode()+body+(b'\n' if len(body)%2 else b'')
ipk_name='com.cleanyourtv.manager_'+version+'_all.ipk';(dest/ipk_name).write_bytes(ipk)
receipt={'payload':{'name':payload_name,'sha256':hashlib.sha256(payload).hexdigest(),'bytes':len(payload),'files':len(files),'extracted_bytes':sum(map(len,files.values()))},'apps':{'name':ipk_name,'sha256':hashlib.sha256(ipk).hexdigest(),'bytes':len(ipk),'contains_services_or_boot_hooks':False},'manifest':manifest,'install_ready':False}
if a.split_apps:
    split=[]
    for app_id in ['com.cleanyourtv.manager','com.cleanyourtv.picker','com.cleanyourtv.notify']:
        selected={n:b for n,b in apps.items() if n.startswith('usr/palm/applications/'+app_id+'/')}
        info=json.loads(selected['usr/palm/applications/'+app_id+'/appinfo.json']);v=info['version']
        selected['usr/palm/packages/'+app_id+'/packageinfo.json']=json.dumps({'id':app_id,'version':v,'app':app_id}).encode()
        ctl=('Package: '+app_id+'\nVersion: '+v+'\nSection: misc\nPriority: optional\nArchitecture: all\nInstalled-Size: '+str(sum(map(len,selected.values()))+4096)+'\nMaintainer: N/A <nobody@example.com>\nDescription: CleanYourTV UJ651V app\nwebOS-Package-Format-Version: 2\nwebOS-Packager-Version: x.y.x\n').encode()
        blob=b'!<arch>\n'
        for n,body in [('debian-binary',b'2.0\n'),('control.tar.gz',tgz({'control':ctl})),('data.tar.gz',tgz(selected))]:
            blob+=('%-16s%-12d%-6d%-6d%-8s%-10d`\n'%(n+'/',0,0,0,'100644',len(body))).encode()+body+(b'\n' if len(body)%2 else b'')
        name=app_id+'_'+v+'_all.ipk';(dest/name).write_bytes(blob)
        split.append({'id':app_id,'version':v,'name':name,'sha256':hashlib.sha256(blob).hexdigest(),'bytes':len(blob),'contains_services_or_boot_hooks':False})
    receipt['apps_split']=split;receipt['apps']=split[0]
(dest/'receipt.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in receipt.items() if k!='manifest'}))
