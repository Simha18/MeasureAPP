/**
 * Pure TypeScript Base64 to Uint8Array decoder for React Native and Expo environments.
 */
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = new Uint8Array(256);
for (let i = 0; i < B64_CHARS.length; i++) {
  B64_LOOKUP[B64_CHARS.charCodeAt(i)] = i;
}

export function base64ToUint8Array(base64: string): Uint8Array {
  // Strip potential data URL prefix
  const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;

  const globalBuffer = (globalThis as { Buffer?: { from: (str: string, enc: string) => Uint8Array } }).Buffer;
  if (typeof globalBuffer !== 'undefined') {
    return new Uint8Array(globalBuffer.from(cleanBase64, 'base64'));
  }

  const len = cleanBase64.length;
  let placeHolders = 0;
  if (cleanBase64.charAt(len - 1) === '=') placeHolders++;
  if (cleanBase64.charAt(len - 2) === '=') placeHolders++;

  const byteLen = (len * 3) / 4 - placeHolders;
  const bytes = new Uint8Array(byteLen);

  let cur = 0;
  for (let i = 0; i < len; i += 4) {
    const enc1 = B64_LOOKUP[cleanBase64.charCodeAt(i)];
    const enc2 = B64_LOOKUP[cleanBase64.charCodeAt(i + 1)];
    const enc3 = B64_LOOKUP[cleanBase64.charCodeAt(i + 2)];
    const enc4 = B64_LOOKUP[cleanBase64.charCodeAt(i + 3)];

    bytes[cur++] = (enc1 << 2) | (enc2 >> 4);
    if (cur < byteLen) bytes[cur++] = ((enc2 & 15) << 4) | (enc3 >> 2);
    if (cur < byteLen) bytes[cur++] = ((enc3 & 3) << 6) | (enc4 & 63);
  }

  return bytes;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const globalBuffer = (globalThis as { Buffer?: { from: (data: Uint8Array) => { toString: (enc: string) => string } } }).Buffer;
  if (typeof globalBuffer !== 'undefined') {
    return globalBuffer.from(bytes).toString('base64');
  }

  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;

    result += B64_CHARS.charAt(b0 >> 2);
    result += B64_CHARS.charAt(((b0 & 3) << 4) | (b1 >> 4));
    result += i + 1 < len ? B64_CHARS.charAt(((b1 & 15) << 2) | (b2 >> 6)) : '=';
    result += i + 2 < len ? B64_CHARS.charAt(b2 & 63) : '=';
  }
  return result;
}
