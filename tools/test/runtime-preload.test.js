'use strict';
var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var configure = require('../../compat/runtime-preload');
var directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cytv-private-runtime-'));
var bin = path.join(directory, 'bin');
fs.mkdirSync(bin);
var wrapper = path.join(bin, 'node');
fs.writeFileSync(wrapper, '#!/bin/sh\n');
try {
  var target = {execPath: '/private/loader', env: {PATH: 'system-bin' + path.delimiter + bin, LD_LIBRARY_PATH: 'original-value'}};
  configure(target, directory);
  assert.strictEqual(target.execPath, wrapper);
  assert.strictEqual(target.env.PATH.split(path.delimiter)[0], bin);
  assert.strictEqual(target.env.PATH.split(path.delimiter).filter(function (entry) { return entry === bin; }).length, 1);
  console.log('ok   private Node forks use wrapper and path is not duplicated');
  assert.strictEqual(target.env.LD_LIBRARY_PATH, 'original-value');
  configure(target, directory);
  assert.strictEqual(target.env.LD_LIBRARY_PATH, 'original-value');
  console.log('ok   private runtime does not alter inherited library search environment');
  assert.throws(function () { configure(target, 'relative'); });
  assert.throws(function () { configure(target, path.join(directory, 'missing')); });
  console.log('ok   rejects unavailable or relative private runtime');
} finally {
  fs.unlinkSync(wrapper); fs.rmdirSync(bin); fs.rmdirSync(directory);
}
