
import { equal } from 'node:assert';
import { parse, codecs } from "../cid.js";

const wtf = 'bafkr4idcy33utsake6atvbagnojkn7odp7mdo6n7tvspd4ndnewphj67xu';
// base32 - cidv1 - raw - (blake3 : 256 : 62C6F749C80A27813A84066B92A6FDC37FD83779BF9D64F1F1A3692CF3A7DFBD)

describe('CID parsing', () => {
  it('parses a valid CID', () => {
    const { version, codec, multihash } = parse(wtf);
    equal(version, 1, 'version must be 1');
    equal(codec, codecs.raw, 'codec must be raw');
    // XXX also needs the multihash parsed
    console.log(multihash);
  });
});
