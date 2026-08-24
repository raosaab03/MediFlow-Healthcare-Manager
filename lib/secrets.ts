const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)); }
function fromBase64(value: string): Uint8Array { return Uint8Array.from(atob(value), char => char.charCodeAt(0)); }

async function encryptionKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(value: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(secret), encoder.encode(value));
  return `v1:${toBase64(iv)}:${toBase64(new Uint8Array(encrypted))}`;
}

export async function decryptSecret(value: string, secret: string): Promise<string> {
  if (!value.startsWith("v1:")) return value;
  const [, iv, encrypted] = value.split(":");
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(fromBase64(iv)) }, await encryptionKey(secret), new Uint8Array(fromBase64(encrypted)));
  return decoder.decode(plaintext);
}

export async function signState(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `${btoa(payload)}.${toBase64(new Uint8Array(signature))}`;
}

export async function verifyState(state: string, secret: string): Promise<string | null> {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;
  try {
    const decoded = atob(payload);
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("HMAC", key, new Uint8Array(fromBase64(signature)), encoder.encode(decoded));
    return valid ? decoded : null;
  } catch { return null; }
}
