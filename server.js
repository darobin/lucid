
import express, { Router } from 'express';
import Manifest from "./manifest.js";
import makeRel from './lib/rel.js';

const rel = makeRel(import.meta.url);

// Produces a static router for a given path and manifest (for that path).
// It's the caller's job to keep this up to date if the data changes.
export async function makeRouter (root, m) {
  const r = new Router();
  const sendOptions = makeSendOptions(root);
  const { resources } = m.manifest();
  const { cid, tile } = await m.tile();
  const byHost = {};
  r.get(`/ipfs/${cid}`, (req, res) => res.type('application/web-tile').send(tile));
  byHost[cid] = { type: 'bytes', mediaType: 'application/web-tile', src: tile };
  Object.entries(resources).forEach(([p, { src, mediaType = 'application/octet-stream' }]) => {
    r.get(`/ipfs/${src}`, (req, res) => res.type(mediaType).sendFile(p, sendOptions));
    byHost[src] = { type: 'path', mediaType, src: p };
  });
  r.use((req, res, next) => {
    const host = req.hostname;
    if (!/\w+\.ipfs\.localhost$/.test(host)) return next();
    const cid = host.replace(/\.ipfs\.localhost$/, '');
    if (!byHost[cid]) return;
    const { type, mediaType, src } = byHost[cid];
    res.type(mediaType);
    if (type === 'bytes') return res.send(src);
    res.sendFile(src, sendOptions);
  });
  return r;
}

export async function devServer (root, options) {
  const app = express();
  const sendOptions = makeSendOptions(root);

  // Serve the UI from a .wk, that cannot appear in tiles (we could protect against that)
  app.use('/.well-known/lucid/', express.static(rel('dev-server')));

  // let's watch a manifest
  let manifest;
  let tile;
  const m = new Manifest(root);
  await m.watch();
  manifest = m.manifest();
  tile = await m.tile();
  m.on('update', async (man) => {
    manifest = man;
    tile = await m.tile();
    // XXX
    // - print something
    // - emit to the EventSource stream so the UI changes the source
  });

  // subdomains, actually
  app.get('/', (req, res, next) => {
    const host = req.hostname;
    if (!/\w+\.ipfs\.localhost$/.test(host)) return next();
    const cid = host.replace(/\.ipfs\.localhost$/, '');
    if (tile.cid === cid) return res.type('application/web-tile').send(tile.tile);
    const r = Object.entries(manifest.resources).find(([, { src }]) => src === cid);
    if (!r) return next();
    res.type(r[1].mediaType).sendFile(r[0], sendOptions);
  });

  // - open viewer to /.well-known/lucid/#${CID}
  // - if possible, redirect / to /.well-known/lucid/#${CID} (this assumes that the SW intercepts / always)
  // - set Service-Worker-Allowed: /
  // - serve SW from /.well-known/lucid/sw.js (it's just the dev-server dir I guess)
  // - iframe loads / (after SW is instantiated)
  // - SW gets data from ${CID}.ipfs.localhost (need to respond to host) by mapping from the host

  // - event source
  // - watch the dir
  // - mount the router generator, and remount when there's a change

  app.listen(options.port, () => {
    console.warn(`Lucid serving tiles from '${root}' at http://localhost:${options.port}/.`);
  });
}

function makeSendOptions (root) {
  return {
    root,
    maxAge: 10 * 365 * 24 * 60 * 60 * 1000,
    immutable: true,
  };
}

// XXX
// This supports:
//  - A dev server that sends a UI showing the web+tile URL and updates it whenever
//    it receives a change of manifest via an EventSource. It also configures a
//    vhost to serve the tile along with the route to provide its content.
//  - The UI also has a worker that can DTRT on the client side.
