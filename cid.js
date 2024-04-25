
import { Buffer } from 'node:buffer';
import { blake3, createBLAKE3 } from 'hash-wasm';
import { encode } from '@ipld/dag-cbor';

const B32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const B32_CODES = new Map(B32_ALPHABET.split('').map((k, i) => [k, i]));

export const CODECS = {
  raw: 0x55,
  dagCBOR: 0x71,
};
const SUPPORTED_CODECS = new Set(Object.values(CODECS));

const BLAKE3_CODE = 0x1e;
const BLAKE3_SIZE = 32;

const BITS_PER_CHAR = 5;

// Gets a CID as string or Uint8Array.
// Returns a structure with all components.
// Throws if we don't support it.
// (Code heavily inspired by js-multiformats.)
export function parse (cid) {
  // If we get a string, parse it into Uint8Array.
  let uarr;
  if (typeof cid === 'string') {
    if (cid.length === 46 && /^Qm/.test(cid)) throw new Error('CIDv0 is not supported.');
    if (cid[0] !== 'b') throw new Error('Only base32 lowercase is supported.');
    cid = cid.substring(1);
    uarr = new Uint8Array((cid.length * BITS_PER_CHAR / 8) | 0);
    let bits = 0;
    let buffer = 0;
    let written = 0;
    for (let i = 0; i < cid.length; i++) {
      if (!B32_CODES.has(cid[i])) throw new Error(`Invalid character "${cid[i]}"`);
      const value = B32_CODES.get(cid[i]);
      buffer = (buffer << BITS_PER_CHAR) | value;
      bits += BITS_PER_CHAR;
      if (bits >= 8) {
        bits -= 8;
        uarr[written++] = 0xff & (buffer >> bits);
      }
    }
    if (bits >= BITS_PER_CHAR || 0xff & (buffer << (8 - bits))) {
      // console.error(bits, bitsPerChar, 0xff & (buffer << (8 - bits)));
      throw new Error('Unexpected end of data');
    }
  }
  else {
    uarr = cid;
  }
  // IMPORTANT: we don't process varints because for now we don't need to. See details on makeCID().
  const version = uarr[0];
  if (version !== 1) throw new Error(`Only version 1 is supported, got ${version}.`);
  const codec = uarr[1];
  if (!SUPPORTED_CODECS.has(codec)) throw new Error(`Unsupported CID codec ${codec}`);
  const multihashBytes = uarr.slice(2);
  if (multihashBytes[0] !== BLAKE3_CODE) throw new Error(`The only supported hash type is Blake3, got "${multihashBytes[0]}".`);
  if (multihashBytes[1] !== BLAKE3_SIZE) throw new Error('Wrong size for Blake3 hash.');
  const hash = Buffer.from(multihashBytes.slice(2)).toString('hex');
  return { version, codec, codecType: (codec === CODECS.raw) ? 'raw-bytes' : 'dag-cbor', hash, hashType: 'blake3' };
}

export async function fromRaw (buf) {
  return await makeCID(buf, CODECS.raw);
}

// NOTE: in order for it to encode correctly, the CIDs in the data will have to be CID objects
// from multiformats.
export async function fromData (obj) {
  const buf = encode(obj);
  return await makeCID(buf, CODECS.dagCBOR);
}

// XXX test me
export async function fromStream (s) {
  const b3 = await createBLAKE3();
  b3.init();
  return new Promise((resolve, reject) => {
    s.on('data', (chunk) => b3.update(chunk));
    s.on('error', reject);
    s.on('end', async () => resolve(await makeCIDFromHash(b3.digest('binary'), CODECS.raw)));
  });
}

// IMPORTANT NOTE
// Because of the options that we are working with, all of the varints that we need to encode are
// smaller than 128. This means that the int and the varint have the same bytes. This is true of:
//  - version: 1
//  - codec: 85, 113
//  - hash: 30
//  - hash size: 32
// Less code better. However, IF a value larger than 127 needs to be encoded, we'll have to support
// varints properly.
async function makeCID (buf, codec) {
  const hashBytes = Buffer.from(await hash(buf), 'hex');
  return await makeCIDFromHash(hashBytes, codec);
}

async function makeCIDFromHash (hashBytes, codec) {
  const uarr = [1, codec, BLAKE3_CODE, BLAKE3_SIZE, ...hashBytes];

  const mask = (1 << BITS_PER_CHAR) - 1;
  let cid = 'b';
  let bits = 0;
  let buffer = 0;
  for (let i = 0; i < uarr.length; ++i) {
    buffer = (buffer << 8) | uarr[i];
    bits += 8;
    while (bits > BITS_PER_CHAR) {
      bits -= BITS_PER_CHAR;
      cid += B32_ALPHABET[mask & (buffer >> bits)];
    }
  }
  if (bits !== 0) cid += B32_ALPHABET[mask & (buffer << (BITS_PER_CHAR - bits))];
  return cid;
}

export async function hash (buf) {
  return await blake3(buf);
}
