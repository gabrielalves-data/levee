'use strict';

// Opt-in encryption for JSON backup exports (SSOT §4.5). Users often drop
// backups in Dropbox/Drive — the exact exfiltration path local-only otherwise
// avoids. No existing Node-crypto convention in this repo to reuse (DB at-rest
// encryption delegates entirely to SQLite's own `rekey` pragma), so this is a
// small, self-contained module: scrypt(N=2^15) key derivation + AES-256-GCM.

const crypto = require('crypto');

const SCRYPT_N = 2 ** 15;
const KEY_LEN = 32;

function deriveKey(passphrase, salt) {
  // Node's scrypt maxmem defaults to 32MB, which N=2^15 sits right at the edge
  // of (128 * N * r with the default r=8) — bump it so the derivation doesn't
  // throw ERR_CRYPTO_INVALID_SCRYPT_PARAMS.
  return crypto.scryptSync(passphrase, salt, KEY_LEN, { N: SCRYPT_N, maxmem: 64 * 1024 * 1024 });
}

// plaintextJson: string (already-serialized JSON). Returns the export envelope.
function encryptExport(passphrase, plaintextJson) {
  const salt = crypto.randomBytes(16);
  const key = deriveKey(passphrase, salt);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plaintextJson, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: data.toString('base64'),
  };
}

// Returns the decrypted plaintext JSON string. Throws (auth tag mismatch) on
// a wrong passphrase or tampered payload — never returns partial/garbage data.
function decryptExport(passphrase, payload) {
  const salt = Buffer.from(payload.salt, 'base64');
  const key = deriveKey(passphrase, salt);
  const iv = Buffer.from(payload.iv, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  const data = Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]);
  return data.toString('utf8');
}

function isEncryptedExport(payload) {
  return !!payload && payload.v === 1 &&
    typeof payload.salt === 'string' && typeof payload.iv === 'string' &&
    typeof payload.tag === 'string' && typeof payload.data === 'string';
}

module.exports = { encryptExport, decryptExport, isEncryptedExport };
