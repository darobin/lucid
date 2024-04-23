
import { equal } from 'node:assert';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { blake3 } from 'hash-wasm';
import makeRel from '../lib/rel.js';
import { parse, codecs } from "../cid.js";

const rel = makeRel(import.meta.url);

let wtfData, wtfHash;
const wtf = 'bafkr4idcy33utsake6atvbagnojkn7odp7mdo6n7tvspd4ndnewphj67xu';
// base32 - cidv1 - raw - (blake3 : 256 : 62C6F749C80A27813A84066B92A6FDC37FD83779BF9D64F1F1A3692CF3A7DFBD)

before(async () => {
  wtfData = await readFile(rel('fixtures/wtf.jpg'));
  wtfHash = await blake3(wtfData);
});
describe('CID parsing', () => {
  it('parses a valid CID', () => {
    const { version, codec, codecType, hash, hashType } = parse(wtf);
    equal(version, 1, 'version must be 1');
    equal(codec, codecs.raw, 'codec must be raw');
    equal(codecType, 'raw-bytes', 'codec type must be raw-bytes');
    equal(hashType, 'blake3', 'hash type must be blake3');
    equal(new Buffer(hash).toString('hex'), wtfHash, 'hash must be the right one');
  });
});
