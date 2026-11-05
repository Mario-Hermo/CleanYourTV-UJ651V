'use strict';
// Exercise the real HTTP boundary, with no TV APIs or root operations.
const assert = require('assert');
const cp = require('child_process');
if (!process.argv[2]) {
  for (const mode of ['stock', 'legacy']) {
    const r = cp.spawnSync(process.execPath, [__filename, mode], {
      encoding: 'utf8', env: Object.assign({}, process.env, { CYTV_LEGACY_UJ651V: mode === 'legacy' ? '1' : '0' })
    });
    process.stdout.write(r.stdout || '');
    process.stderr.write(r.stderr || '');
    if (r.status !== 0) process.exit(1);
  }
} else {
  const http = require('http');
  const legacy = process.argv[2] === 'legacy';
  let handled = 0;
  const server = require('../../helper/server').create({ features: () => [{
    name: 'fixture', paths: ['/api/frontend-ok'], handle: (req, res) => {
      handled++; res.writeHead(200); res.end('fixture');
    }
  }] });
  function request(origin, method) {
    return new Promise((resolve, reject) => {
      const headers = origin === undefined ? {} : { Origin: origin };
      const req = http.request({ host: '127.0.0.1', port: server.address().port,
        path: '/api/frontend-ok', method: method || 'POST', headers }, res => {
        let body = ''; res.on('data', b => { body += b; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      });
      req.on('error', reject); req.end();
    });
  }
  server.listen(0, '127.0.0.1', async () => {
    try {
      for (const id of ['home', 'manager', 'picker', 'notify', 'live']) {
        const before = handled;
        const r = await request('file://com.cleanyourtv.' + id);
        assert.strictEqual(r.status, legacy ? 200 : 403);
        assert.strictEqual(handled - before, legacy ? 1 : 0);
        assert.strictEqual(r.headers['access-control-allow-origin'], legacy ? '*' : undefined);
      }
      for (const origin of ['file://com.attacker.home', 'file://com.cleanyourtv.home.evil',
        'file://com.cleanyourtv.home/path', 'https://com.cleanyourtv.home', 'http://localhost:8765']) {
        const before = handled, r = await request(origin);
        assert.strictEqual(r.status, 403); assert.strictEqual(handled, before);
        assert.strictEqual(r.headers['access-control-allow-origin'], undefined);
      }
      for (const origin of [undefined, 'null', 'file://', 'file://com.webos.app.home-webos', 'file://com.cleanyourtv.manager-webos']) {
        const r = await request(origin); assert.strictEqual(r.status, 200);
      }
      const before = handled, preflight = await request('file://com.cleanyourtv.home', 'OPTIONS');
      assert.strictEqual(preflight.status, legacy ? 204 : 403);
      assert.strictEqual(handled, before);
      console.log('ok   ' + (legacy ? 'legacy' : 'stock') + ' HTTP origins: 16 cases, strict rejection before handler');
    } catch (e) { console.error(e.stack); process.exitCode = 1; }
    finally { server.close(); }
  });
}
