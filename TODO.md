
## Overall

- [x] document project as having more than just simpler CIDs
- [ ] document Tiles/DevServer and their APIs properly

## Tiles

- [x] add CSP to SW
  - [x] test CSP
- [x] surface manifest metadata to viewer
  - [x] include icons support
- [x] test that updating content moves the frontend
- [x] make frontend look good
- [ ] make a more complex demo

## Distribution

- [ ] Support range requests
- [ ] Make it work in Nostr?
- [ ] Make a little Express middleware that can work to ship to your own site
- [ ] Would it make sense to have a tile gateway? bafy….tile.example.net

## Caddify

- [x] Finish pushing config to Caddy
  - [x] Test it
- [x] Document
- [ ] Add a watch option that replaces the configuration whenever there's a change
- [ ] Support for more than one dir per server (use distinct @id prefixes)
- [ ] Add option to stop serving (just deletes)
- [ ] Make it announce itself, e.g. on IPNI
- [ ] A separate process that can be reverse proxied from *.ipfs.domain would be neat too

## Nostrify — IPFS

- [ ] A basic Nostr server that supports the minimum protocol and can expose events usefully
  - [x] finish onREQ
  - [x] write actual tests
  - [ ] integrate into augury
  - [x] add a configuration that has allowlisting of pubkeys
- [x] A special way to provide content for IPFS
- [x] Expose the IPFS over an HTTP gateway
- [ ] Mimic IPNI over Nostr? Or register with IPNI?
- [ ] Tinker with a client that will upload this way
- [ ] add ipfs/lucid to NIP-94
- [ ] add a field to NIP-96 to indicate that the server produces URLs that are IPFS-gateway compatible

## Nostrify — Tiles

- [ ] Upload test tile to the augury server
- [ ] Tinker with a client that will render tiles (size rules too?)
