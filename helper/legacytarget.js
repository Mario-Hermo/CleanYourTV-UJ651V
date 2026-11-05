'use strict';
// This port is qualified for one observed hardware/firmware combination only.
const TARGET = {modelName:'49UJ651V-ZA',firmwareVersion:'06.10.75',otaId:'HE_DTV_W17P_AFADABAA',sdkVersion:'3.9.0'};
function verify(info) {
  if (!info || info.returnValue !== true || Object.keys(TARGET).some(k => info[k] !== TARGET[k]))
    throw new Error('Unsupported legacy target; nothing applied');
  return true;
}
function identity(run) {
  const r = run('/usr/bin/luna-send', ['-n','1','-w','4000','-f',
    'luna://com.webos.service.tv.systemproperty/getSystemInfo', JSON.stringify({keys:Object.keys(TARGET)})]);
  if (r.status !== 0) throw new Error('Cannot verify legacy TV identity');
  const info = JSON.parse(String(r.stdout)); verify(info); return info;
}
module.exports = {TARGET,verify,identity};
