import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isPublicAddress, resolvePublicUrl, openPublicMedia, downloadPublicMedia } from '../src/lib/public-media.ts';

const lookup = async () => [{ address: '93.184.216.34', family: 4 }];
function mockRequest(responses, observed = []) {
  return (options, callback) => {
    observed.push(options);
    const req = new EventEmitter();
    req.end = () => queueMicrotask(() => {
      const spec = responses.shift();
      const stream = spec.stream ?? Readable.from(spec.chunks ?? [Buffer.from('media')]);
      stream.statusCode = spec.status ?? 200;
      stream.headers = spec.headers ?? { 'content-type': 'video/mp4' };
      options.signal.addEventListener('abort', () => stream.destroy(options.signal.reason), { once: true });
      callback(stream);
    });
    return req;
  };
}
async function temporary(run) {
  const dir = await mkdtemp(path.join(tmpdir(), 'clipforge-test-'));
  try { await run(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
test('blocks private, special-use, mapped and transition addresses', async () => {
  for (const ip of ['127.0.0.1','10.1.2.3','172.16.1.1','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','224.0.0.1','192.0.2.1','198.18.0.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','64:ff9b::7f00:1','2002:7f00:1::','2001:db8::1']) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
  assert.equal(isPublicAddress('93.184.216.34'), true);
  await assert.rejects(resolvePublicUrl('http://2130706433/'), /non-public/);
});
test('rejects credential URLs, non-HTTP schemes and mixed private DNS answers', async () => {
  for (const url of ['file:///etc/passwd', 'ftp://example.com/a', 'https://user:pass@example.com']) {
    await assert.rejects(resolvePublicUrl(url, lookup));
  }
  await assert.rejects(resolvePublicUrl('https://example.com', async () => [...await lookup(), { address: '10.0.0.1', family: 4 }]), /non-public/);
});
test('pins validated address to connection; no second DNS lookup can rebind', async () => {
  let lookups = 0; const observed = [];
  const res = await openPublicMedia('https://example.com/media', {
    signal: new AbortController().signal,
    lookup: async () => ++lookups === 1 ? lookup() : [{ address: '127.0.0.1', family: 4 }],
    request: mockRequest([{}], observed),
  });
  let pinned;
  observed[0].lookup('example.com', {}, (_error, address) => { pinned = address; });
  assert.equal(pinned, '93.184.216.34'); assert.equal(lookups, 1);
  assert.equal(observed[0].hostname, 'example.com'); assert.equal(observed[0].agent, false);
  res.destroy();
});
test('revalidates redirects before making the next request', async () => {
  const observed = [];
  await assert.rejects(openPublicMedia('https://example.com/media', {
    signal: new AbortController().signal, lookup,
    request: mockRequest([{ status: 302, headers: { location: 'http://169.254.169.254/latest' } }], observed),
  }), /non-public/);
  assert.equal(observed.length, 1);
});
test('valid public media downloads completely', () => temporary(async dir => {
  const dest = path.join(dir, 'media.mp4');
  assert.equal(await downloadPublicMedia('https://example.com/video', () => dest, { lookup, request: mockRequest([{}]), maxBytes: 5 }), dest);
  assert.equal(await readFile(dest, 'utf8'), 'media');
}));
test('oversized chunked streams abort and remove partial files', () => temporary(async dir => {
  await assert.rejects(downloadPublicMedia('https://example.com/video', () => path.join(dir, 'media'), {
    lookup, maxBytes: 5, request: mockRequest([{ chunks: [Buffer.from('1234'), Buffer.from('5678')] }]),
  }), /limit/);
  assert.deepEqual(await readdir(dir), []);
}));
test('endless response bodies hit a deadline and remove partial files', () => temporary(async dir => {
  const stream = new Readable({ read() {} });
  await assert.rejects(downloadPublicMedia('https://example.com/video', () => path.join(dir, 'media'), {
    lookup, timeoutMs: 30, request: mockRequest([{ stream }]),
  }));
  assert.equal(stream.destroyed, true); assert.deepEqual(await readdir(dir), []);
}));
test('DNS resolution is covered by the total deadline', async () => {
  await assert.rejects(downloadPublicMedia('https://example.com/video', () => '/unused', {
    lookup: () => new Promise(() => {}), timeoutMs: 30,
    request: () => { throw new Error('must not request'); },
  }), /deadline/);
});

test('existing files are never removed on exclusive-create failure', () => temporary(async dir => {
  const dest=path.join(dir,'media');await writeFile(dest,'existing');
  await assert.rejects(downloadPublicMedia('https://example.com/video',()=>dest,{lookup,request:mockRequest([{}])}));
  assert.equal(await readFile(dest,'utf8'),'existing');
}));
