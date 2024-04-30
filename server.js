
import { Router } from 'express';

// Produces a static router for a given path and manifest (for that path).
// It's the caller's job to keep this up to date if the data changes.
export async function makeRouter (root, m) {
  const r = new Router();
  const sendOptions = {
    root,
    maxAge: 10 * 365 * 24 * 60 * 60 * 1000,
    immutable: true,
  };
  const { resources } = m.manifest();
  const { cid, tile } = await m.tile();
  r.get(`/ipfs/${cid}`, (req, res) => res.type('application/web-tile').send(tile));
  Object.entries(resources).forEach(([p, { src, mediaType }]) => {
    r.get(`/ipfs/${src}`, (req, res) => res.type(mediaType || 'application/octet-stream').send(p, sendOptions));
  });
  return r;
}


// XXX
// This supports:
//  - A dev server that sends a UI showing the web+tile URL and updates it whenever
//    it receives a change of manifest via an EventSource. It also configures a
//    vhost to serve the tile along with the route to provide its content.
//  - The UI also has a worker that can DTRT on the client side.
