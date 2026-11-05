'use strict';
// Retire the detached group we continuously own, including subscriptions whose leader exited.
const fs=require('fs');
function members(group) {
  const found=[];
  for(const pid of fs.readdirSync('/proc').filter(p=>/^\d+$/.test(p))){
    try{const s=fs.readFileSync('/proc/'+pid+'/stat','utf8'),a=s.slice(s.lastIndexOf(') ')+2).trim().split(/\s+/);
      if(Number(a[2])===group)found.push({pid:Number(pid),group:Number(a[2]),start:a[19]});
    }catch(e){if(e.code!=='ENOENT'&&e.code!=='ESRCH')throw e;}
  }
  return found;
}
async function retire(owned,io) {
  if(!owned||!Number.isInteger(owned.pid)||owned.pid<=1||!/^\d+$/.test(String(owned.start)))throw new Error('Invalid owned group');
  const ops=io||{scan:members,signal:(p,s)=>process.kill(-p,s),wait:()=>new Promise(r=>setTimeout(r,100)),self:process.pid};
  for(let attempt=0;attempt<35;attempt++){
    const list=ops.scan(owned.pid);
    if(!list.length){owned.retired=true;return true;}
    if(owned.retired||list.some(p=>p.group!==owned.pid||p.pid===ops.self||Number(p.start)<Number(owned.start)||
      (p.pid===owned.pid&&String(p.start)!==String(owned.start))))throw new Error('Group identity changed; retained');
    if(attempt===0||attempt===15){
      try{ops.signal(owned.pid,attempt===0?'SIGTERM':'SIGKILL');}catch(e){if(e.code!=='ESRCH')throw e;}
    }
    await ops.wait();
  }
  return false;
}
module.exports={members,retire};
