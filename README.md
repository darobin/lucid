
# LUCID — Lightweight Universal CIDs

[CIDs](https://github.com/multiformats/cid) (Content IDentifiers) are an excellent and highly-extensible
format for content-addressing. One aspect that is hampering their wider adoption is the wealth of 
options that they support and the accompanying complexity. LUCID is an experiment to see how small a
subset of that option space we can get away with supporting while working on key non-IPFS goals. LUCIDs
have two requirements:

1. They are fully compatible with CIDs: any off-the-shelf piece of software that reads CIDs will read
   LUCIDs with no modifications. This also means that LUCIDs retain CIDs' extensibility, they just don't
   make use of it just yet.
2. They support as few CID options as possible (though this set may grow as we explore the space more):
   1. Only v1, no v0.
   2. Only base32 multibase encoding (the `b` prefix) for the string, human-readable encoding.
   3. Only the raw-binary codec (`0x55`) and (maybe) dag-cbor (`0x71`).
   4. Only Blake3 hashes (`0x1e`).
   5. No blocks.

This is a highly opinionated and arguably wrong set of options. No blocks means that big files are big 
and will need to be split at a separate layer if that is desirable (e.g. seekable video will need to
use MPEG-DASH or something similar).

One valuable property of LUCIDs is that they can be string-compared. They only need to parsed when there
is a need to access the codec or the hash.
