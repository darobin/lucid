
import { equal, throws } from 'node:assert';
import { readFile } from 'node:fs/promises';
import makeRel from '../lib/rel.js';
import { parse, codecs, fromRaw, hash } from "../cid.js";

const rel = makeRel(import.meta.url);

let wtfData, wtfHash;
const wtf = 'bafkr4idcy33utsake6atvbagnojkn7odp7mdo6n7tvspd4ndnewphj67xu';
// base32 - cidv1 - raw - (blake3 : 256 : 62C6F749C80A27813A84066B92A6FDC37FD83779BF9D64F1F1A3692CF3A7DFBD)

before(async () => {
  wtfData = await readFile(rel('fixtures/wtf.jpg'));
  wtfHash = await hash(wtfData);
});
describe('CID parsing', () => {
  it('parses a valid CID', () => {
    const { version, codec, codecType, hash, hashType } = parse(wtf);
    equal(version, 1, 'version must be 1');
    equal(codec, codecs.raw, 'codec must be raw');
    equal(codecType, 'raw-bytes', 'codec type must be raw-bytes');
    equal(hashType, 'blake3', 'hash type must be blake3');
    equal(hash, wtfHash, 'hash must be the right one');
  });
  it('refuses to parse invalid LUCIDs', () => {
    throws(() => parse('QmNprJ78ovcUuGMoMFiihK7GBpCmH578JU8hm43uxYQtBw'), /CIDv0 is not supported/, 'no v0');
    throws(() => parse('zb2rhe5P4gXftAwvA4eXQ5HJwsER2owDyS9sKaQRRVQPn93bA'), /Only base32 lowercase is supported/, 'only b32');
    throws(() => parse('bafkr4idcy33utsake8atvbagnojkn7odp7mdo6n7tvspd4ndnewphj67xu'), /Invalid character/, 'only valid characters');
    // throws(() => parse('babkr4ibfguvoa2fvjkj66yeufqef3ir2ginh66mfde4raiq42t7775p7wy'), /CIDv0 is not supported/, 'no v0 either');
    throws(() => parse('bajkr4ibfguvoa2fvjkj66yeufqef3ir2ginh66mfde4raiq42t7775p7wy'), /Only version 1 is supported/, 'no v2');
    throws(() => parse('baeir4ibfguvoa2fvjkj66yeufqef3ir2ginh66mfde4raiq42t7775p7wy'), /Unsupported CID codec/, 'limited codecs');
    throws(() => parse('bafkrcibfguvoa2fvjkj66yeufqef3ir2ginh66mfde4raiq42t7775p7wy'), /The only supported hash type is Blake3/, 'only blake3');
    throws(() => parse('bafkr4ejfguvoa2fvjkj66yeufqef3ir2ginh66mfde4raiq42t7775p7wy'), /Wrong size for Blake3 hash/, 'wrong blake3');
  });
});

describe('CID minting', () => {
  it('mints a valid CID for bytes', async () => {
    const cid = await fromRaw(wtfData);
    equal(cid, wtf, 'CID is correct');
  });
});
