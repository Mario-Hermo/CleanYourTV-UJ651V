'use strict';
// Invoking ELF through its private loader can expose the loader as execPath.
// Forked Node workers must re-enter the wrapper, retaining the private ABI.
var fs = require('fs');
var path = require('path');
function configure(target, directory) {
  if (!directory || !path.isAbsolute(directory)) throw new Error('Private runtime path must be absolute');
  var wrapper = path.join(directory, 'bin', 'node');
  if (!fs.statSync(wrapper).isFile()) throw new Error('Private runtime wrapper unavailable');
  target.execPath = wrapper;
  var entries = String(target.env.PATH || '').split(path.delimiter).filter(function (entry) { return entry !== path.dirname(wrapper); });
  target.env.PATH = path.dirname(wrapper) + path.delimiter + entries.join(path.delimiter);
}
module.exports = configure;
if (process.env.CYTV_RUNTIME) configure(process, process.env.CYTV_RUNTIME);
