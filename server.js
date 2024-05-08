
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

// XXX ISSUES
// - getting update events before we've parsed the full directory

export async function devServer (root, options) {
  const app = express();
  const sendOptions = makeSendOptions(root);
  let manifest;
  let tile;
  let ssePool = new Set();

  // Serve the UI from a .wk, that cannot appear in tiles (we could protect against that)
  app.use('/.well-known/lucid/', express.static(rel('dev-server')));

  // we allow full path control
  app.use((req, res, next) => {
    res.setHeader('service-worker-allowed', '/');
    next();
  });

  // SSE
  app.get('/.well-known/lucid/events', (req, res) => {
    console.warn(`SSE SUB!`);
    res.writeHead(200, {
      connection: 'keep-alive',
      'cache-control': 'no-cache',
      'content-type': 'text/event-stream',
    });
    ssePool.add(res);
    if (tile?.cid) sendSSEUpdate(tile.cid);
    res.on('close', () => {
      ssePool.delete(res);
      res.end();
    });
  });

  function sendSSEUpdate (cid) {
    console.warn(`• updating with ${cid}`);
    if (!ssePool.size) return;
    Array.from(ssePool.values()).forEach(res => {
      console.warn(`• sending…`);
      res.write(`event: new-cid\ndata: ${JSON.stringify({ cid })}\n\n`);
    });
  }

  // let's watch a manifest
  const m = new Manifest(root);
  await m.watch();
  const manifestUpdate = async (man) => {
    manifest = man;
    tile = await m.tile();
    console.warn(`Load tile from http://localhost:${options.port}/.well-known/lucid/#${tile.cid}`, manifest?.resources);
    sendSSEUpdate(tile.cid);
  };
  await manifestUpdate(m.manifest());
  m.on('update', manifestUpdate); // XXX I think this is updating before it's ready

  // subdomains, actually
  app.get('/', (req, res, next) => {
    const host = req.hostname;
    // redirect / to /.well-known/lucid/#${CID} (this assumes that the SW intercepts / always)
    if (host === 'localhost') return res.redirect(`/.well-known/lucid/#${tile.cid}`);
    if (!/\w+\.ipfs\.localhost$/.test(host)) return next();
    const cid = host.replace(/\.ipfs\.localhost$/, '');
    if (tile.cid === cid) return res.type('application/web-tile').send(tile.tile);
    const r = Object.entries(manifest.resources).find(([, { src }]) => src === cid);
    if (!r) return next();
    res.type(r[1].mediaType).sendFile(r[0], sendOptions);
  });

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
