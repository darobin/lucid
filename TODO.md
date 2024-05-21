
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

## Caddify

- [x] Finish pushing config to Caddy
  - [x] Test it
- [x] Document
- [ ] Add a watch option that replaces the configuration whenever there's a change
- [ ] Support for more than one dir per server (use distinct @id prefixes)
- [ ] Add option to stop serving (just deletes)
- [ ] Make it announce itself, e.g. on IPNI
- [ ] A separate process that can be reverse proxied from *.ipfs.domain would be neat too
