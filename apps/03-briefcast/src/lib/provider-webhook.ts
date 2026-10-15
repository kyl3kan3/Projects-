import { createHmac, timingSafeEqual } from 'node:crypto';

/** Standard Webhooks/Svix HMAC verification over the exact received bytes.
 * https://docs.svix.com/receiving/verifying-payloads/why
 * https://docs.recall.ai/docs/authenticating-requests-from-recallai
 */
export function verifyProviderWebhook(raw: Buffer, headers: Headers, secret: string | undefined,
  prefix: 'svix' | 'webhook', now = Date.now()) {
  if (!secret?.startsWith('whsec_')) throw new Error('Webhook signing secret is not configured');
  const encoded = secret.slice(6);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('Invalid signing secret');
  const key = Buffer.from(encoded, 'base64');
  if (key.length < 16) throw new Error('Invalid signing secret');
  const id = headers.get(`${prefix}-id`);
  const timestamp = headers.get(`${prefix}-timestamp`);
  const signatures = headers.get(`${prefix}-signature`);
  if (!id || id.length > 200 || !timestamp || !/^\d+$/.test(timestamp) || !signatures) {
    throw new Error('Missing or invalid webhook headers');
  }
  const sentAt = Number(timestamp);
  if (!Number.isSafeInteger(sentAt) || Math.abs(now / 1000 - sentAt) > 300) {
    throw new Error('Webhook timestamp outside allowed window');
  }
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.`).update(raw).digest();
  const valid = signatures.split(/\s+/).some(part => {
    const [version, value, extra] = part.split(',');
    if (version !== 'v1' || !value || extra || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
    const actual = Buffer.from(value, 'base64');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
  if (!valid) throw new Error('Invalid webhook signature');
  return { id, payload: JSON.parse(raw.toString('utf8')) as unknown };
}

export async function readRawWebhookBody(req: Request, maxBytes = 1024 * 1024): Promise<Buffer> {
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Webhook body deadline exceeded')), 10_000);
  });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('Webhook body too large');
      parts.push(value);
    }
    return Buffer.concat(parts, size);
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    clearTimeout(timer!);
    reader.releaseLock();
  }
}
