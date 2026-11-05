'use strict';
// Bounded, standalone diagnostic: no server, Luna calls, installs or persistence.
var assert = require('assert');
var cp = require('child_process');
var crypto = require('crypto');
var fs = require('fs');
assert.strictEqual(process.version, 'v8.12.0');
assert.strictEqual(process.platform, 'linux');
assert.strictEqual(process.arch, 'arm');
assert.strictEqual(crypto.createHash('sha256').update('CleanYourTV').digest('hex').length, 64);
assert.ok(fs.statSync(process.execPath).isFile());
assert.ok(process.execPath.indexOf('/bin/node') === process.execPath.length - 9);
var child = cp.spawnSync(process.execPath, ['-p', 'process.version + ":" + process.arch'], {encoding:'utf8', timeout:5000});
assert.strictEqual(child.status, 0, child.stderr);
assert.strictEqual(child.stdout.trim(), 'v8.12.0:arm');
var shell = cp.spawnSync('/bin/sh', ['-c', 'printf system-shell-ok'], {encoding:'utf8', timeout:5000});
assert.strictEqual(shell.status, 0, shell.stderr);
assert.strictEqual(shell.stdout, 'system-shell-ok');
console.log(JSON.stringify({runtime:process.version, arch:process.arch, crypto:true, nodeChild:true, systemShell:true, persistentChanges:false}));
