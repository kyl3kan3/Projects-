import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingMessage, type RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

type Address = { address: string; family: number };
type Lookup = (hostname: string, options: { all: true }) => Promise<Address[]>;
type Request = typeof httpRequest;

/** Conservative public-unicast policy, including mapped/transition IPv6 forms. */
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 192 && b === 88 && c === 99) || (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) !== 6 || address.includes('%')) return false;
  // Only native global unicast. This excludes mapped/compatible IPv4, NAT64,
  // ULA, link-local, multicast, loopback and unspecified addresses entirely.
  const normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const [first, second] = normalized.split(':').map(part => parseInt(part || '0', 16));
  return (first & 0xe000) === 0x2000 && first !== 0x2002 &&
    !(first === 0x2001 && (second < 0x0200 || second === 0x0db8)) &&
    !(first === 0x3fff && second < 0x1000);
}

export async function resolvePublicUrl(input: string, lookup: Lookup = dnsLookup) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Media URL must be public HTTP(S) without credentials');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const literalFamily = isIP(host);
  const addresses = literalFamily ? [{ address: host, family: literalFamily }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error('Media URL resolves to a non-public address');
  }
  return { url, host, address: addresses[0] };
}

function withAbort<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** Each redirect is resolved afresh, then its exact validated address is pinned. */
export async function openPublicMedia(input: string, options: {
  signal: AbortSignal; lookup?: Lookup; request?: Request; maxRedirects?: number;
}): Promise<IncomingMessage> {
  let next = input;
  for (let hop = 0; hop <= (options.maxRedirects ?? 4); hop++) {
    const resolved = await withAbort(resolvePublicUrl(next, options.lookup), options.signal);
    const { url, host, address } = resolved;
    const response = await withAbort(new Promise<IncomingMessage>((resolve, reject) => {
      const request = options.request ?? (url.protocol === 'https:' ? httpsRequest : httpRequest);
      const requestOptions: RequestOptions = {
        protocol: url.protocol, hostname: host, port: url.port || undefined,
        path: url.pathname + url.search, method: 'GET', agent: false,
        signal: options.signal,
        // Do not resolve again at socket time (DNS rebinding). Preserve the
        // original hostname for Host/TLS certificate validation.
        lookup: (_hostname, lookupOptions, callback) => {
          if (typeof lookupOptions === 'object' && lookupOptions.all) callback(null, [address]);
          else callback(null, address.address, address.family);
        },
        headers: { accept: 'audio/*,video/*,application/octet-stream' },
      };
      const req = request(requestOptions, resolve);
      req.once('error', reject);
      req.end();
    }), options.signal);
    const status = response.statusCode ?? 0;
    if ([301, 302, 303, 307, 308].includes(status)) {
      const location = response.headers.location;
      response.destroy();
      if (!location) throw new Error('Media redirect is missing a location');
      if (hop === (options.maxRedirects ?? 4)) throw new Error('Too many media redirects');
      next = new URL(location, url).href;
      continue;
    }
    if (status < 200 || status >= 300) {
      response.destroy();
      throw new Error(`Media request failed (${status})`);
    }
    return response;
  }
  throw new Error('Too many media redirects');
}

export async function downloadPublicMedia(input: string, destination: (contentType: string) => string, options: {
  maxBytes?: number; timeoutMs?: number; lookup?: Lookup; request?: Request;
} = {}): Promise<string> {
  const maxBytes = options.maxBytes ?? 3 * 1024 * 1024 * 1024;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Media download deadline exceeded')), options.timeoutMs ?? 120_000);
  let response: IncomingMessage | undefined;
  let path: string | undefined;
  let created = false;
  try {
    response = await openPublicMedia(input, { ...options, signal: controller.signal });
    const type = String(response.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (!/^(audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|application\/octet-stream)$/.test(type)) {
      throw new Error('URL did not return a supported media content type');
    }
    const declared = response.headers['content-length'];
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
      throw new Error('Imported file exceeds the download limit');
    }
    path = destination(type);
    let bytes = 0;
    const limit = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        callback(bytes > maxBytes ? new Error('Imported file exceeds the download limit') : null,
          bytes > maxBytes ? undefined : chunk);
      },
    });
    const output = createWriteStream(path, { flags: 'wx' });
    output.once('open', () => { created = true; });
    await pipeline(response, limit, output, { signal: controller.signal });
    if (bytes === 0) throw new Error('Imported file was empty');
    return path;
  } catch (error) {
    response?.destroy();
    if (path && created) await rm(path, { force: true });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
