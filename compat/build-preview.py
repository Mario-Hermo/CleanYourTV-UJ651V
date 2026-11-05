"""Package the unchanged adapted launcher as a normal web app for TV preview.

No service, hooks or installer; the existing full helper must run separately.
Output is selected explicitly and never deletes an upstream dist directory.
"""
from pathlib import Path
import gzip,hashlib,io,json,sys,tarfile
port=Path(__file__).resolve().parents[1]
destination=Path(sys.argv[1]).resolve()
destination.mkdir(parents=True,exist_ok=True)
identifier='com.cleanyourtv.home'
version=json.loads((port/'app/version.json').read_text())['version']
def tgz(files):
    buffer=io.BytesIO()
    with gzip.GzipFile(fileobj=buffer,mode='wb',mtime=0) as zipped:
        with tarfile.open(fileobj=zipped,mode='w',format=tarfile.GNU_FORMAT) as archive:
            directories=set()
            for name in files:
                parent=Path(name).parent
                while str(parent) not in ('.','/'):
                    directories.add(parent.as_posix());parent=parent.parent
            for name in sorted(directories,key=lambda value:(value.count('/'),value)):
                info=tarfile.TarInfo(name);info.type=tarfile.DIRTYPE;info.mode=0o755;info.mtime=1762128000
                archive.addfile(info)
            for name,content in sorted(files.items()):
                info=tarfile.TarInfo(name);info.size=len(content);info.mode=0o644;info.mtime=1762128000
                archive.addfile(info,io.BytesIO(content))
    return buffer.getvalue()
files={}
prefix='usr/palm/applications/'+identifier+'/'
for item in (port/'app').iterdir():
    if item.is_file():files[prefix+item.name]=item.read_bytes()
manifest={'id':identifier,'version':version,'vendor':'cleanyourtv','type':'web','main':'index.html','title':'CleanYourTV','icon':'icon.png','largeIcon':'largeIcon.png','visible':True,'bgColor':'#07080b','disableBackHistoryAPI':True}
files[prefix+'appinfo.json']=json.dumps(manifest).encode()
files['usr/palm/packages/'+identifier+'/packageinfo.json']=json.dumps({'id':identifier,'version':version,'app':identifier}).encode()
control=('Package: '+identifier+'\nVersion: '+version+'\nSection: misc\nPriority: optional\nArchitecture: all\nInstalled-Size: '+str(sum(map(len,files.values()))+4096)+'\nMaintainer: N/A <nobody@example.com>\nDescription: CleanYourTV launcher preview for UJ651V\nwebOS-Package-Format-Version: 2\nwebOS-Packager-Version: x.y.x\n').encode()
blob=b'!<arch>\n'
for name,content in [('debian-binary',b'2.0\n'),('control.tar.gz',tgz({'control':control})),('data.tar.gz',tgz(files))]:
    blob+=('%-16s%-12d%-6d%-6d%-8s%-10d`\n'%(name+'/',0,0,0,'100644',len(content))).encode()+content+(b'\n' if len(content)%2 else b'')
target=destination/(identifier+'_'+version+'_all.ipk')
target.write_bytes(blob)
receipt={'package':str(target),'id':identifier,'version':version,'sha256':hashlib.sha256(blob).hexdigest(),'bytes':len(blob),'file_count':len(files),'contains_service_or_boot_hooks':False,'TV_installed':False}
(destination/'receipt.json').write_text(json.dumps(receipt,indent=2))
print(json.dumps(receipt))
