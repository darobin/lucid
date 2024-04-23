
const b32codes = new Map('abcdefghijklmnopqrstuvwxyz234567'.split('').map((k, i) => [k, i]));

export const codecs = {
  raw: 0x55,
  dagCBOR: 0x71,
};
const supportedCodecs = new Set(Object.values(codecs));

const blake3Code = 0x1e;
const blake3Size = 32;

const MSB = 0x80;
const REST = 0x7F;

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
    const bitsPerChar = 5;
    uarr = new Uint8Array((cid.length * bitsPerChar / 8) | 0);
    let bits = 0;
    let buffer = 0;
    let written = 0;
    for (let i = 0; i < cid.length; i++) {
      if (!b32codes.has(cid[i])) throw new Error(`Invalid character "${cid[i]}"`);
      const value = b32codes.get(cid[i]);
      buffer = (buffer << bitsPerChar) | value;
      bits += bitsPerChar;
      if (bits >= 8) {
        bits -= 8;
        uarr[written++] = 0xff & (buffer >> bits);
      }
    }
    if (bits >= bitsPerChar || 0xff & (buffer << (8 - bits))) {
      // console.error(bits, bitsPerChar, 0xff & (buffer << (8 - bits)));
      throw new Error('Unexpected end of data');
    }
  }
  else {
    uarr = cid;
  }
  if (uarr[0] === 18) throw new Error('CIDv0 is not supported.');
  const { value: version, offset } = varint(uarr);
  if (version !== 1) throw new Error(`Only version 1 is supported, got ${version}.`);
  const { value: codec, offset: restOffset } = varint(uarr, offset);
  if (!supportedCodecs.has(codec)) throw new Error(`Unsupported CID content type ${codec}`);
  const multihashBytes = uarr.slice(restOffset);
  if (multihashBytes[0] !== blake3Code) throw new Error(`The only supported hash type is Blake3, got "${multihashBytes[0]}".`);
  if (multihashBytes[1] !== blake3Size) throw new Error('Wrong size for Blake3 hash.');
  const hash = multihashBytes.slice(2);
  return { version, codec, codecType: (codec === codecs.raw) ? 'raw-bytes' : 'dag-cbor', hash, hashType: 'blake3' };
}

function varint (buf, offset = 0) {
  let value = 0;
  let shift = 0;
  let counter = offset;
  let b;

  do {
    if (counter >= buf.length) throw new Error('Could not decode varint');
    b = buf[counter++];
    value += shift < 28
      ? (b & REST) << shift
      : (b & REST) * Math.pow(2, shift);
    shift += 7;
  } while (b >= MSB)

  return { value, offset: counter };
}
