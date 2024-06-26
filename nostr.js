
import { join } from 'node:path';
import { createReadStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { WebSocketServer } from "ws";
import express from 'express';
import fileUpload from "express-fileupload";
import { verifyEvent } from 'nostr-tools';
import { AceBase } from 'acebase';
import { createSHA256 } from 'hash-wasm';
import { nanoid } from 'nanoid';
import { fileTypeFromFile } from 'file-type';
import mime from 'mime-types';
import { fromStream } from './cid.js';
import { makeSendOptions } from './server.js';
import Logger from './lib/logger.js';

// XXX
// - need to look at the media type ourselves, of course clients don't provide it
// - local preview thing doesn't seem to be hitting the origin (it may be asking another server)

const TAG_SEP = '$__$';

// A bunch of this inspired by https://github.com/coracle-social/bucket/
export default class InterplanetaryNostrum {
  constructor (options = {}) {
    this.port = options.port || 6455;
    this.store = options.store;
    this.subscriptions = new Map();
    this.posters = new Set(options.posters || []);
    if (!this.store) throw new Error(`The "store" option is required.`);
    this.running = false;
    this.debug = new Logger(options.logLevel);
  }
  async storeEvent (event) {
    event.lucid__indexedTags = [];
    (event.tags || []).forEach(([k, v]) => {
      event.lucid__indexedTags.push(`${k}${TAG_SEP}${v || ''}`);
    });
    this.debug.verbose(`Storing ${event.id} of kind ${event.kind}.`);
    await this.db.ref(`events/${event.id}`).set(event);
  }
  async runQuery (sid, channel, filters) {
    if (!this.running) throw new Error(`Cannot run query while not running.`);
    const queries = this.filtersToQueries(filters);
    this.debug.verbose(`Running queries ${sid} in relay instance ${channel.id}.`);
    for (const q of queries) {
      await q.forEach(res => {
        const event = res.val();
        delete event.lucid__indexedTags;
        channel.send(['EVENT', sid, event]);
      });
    }
  }
  addSubscription (sid, channel, filters) {
    if (!this.running) throw new Error(`Cannot add subscription while not running.`);
    const queries = this.filtersToQueries(filters);
    this.debug.verbose(`Adding subscription ${sid} for relay instance ${channel.id}.`);
    queries.forEach(q => {
      q.on('add', (match) => {
        const event = match.snapshot.val();
        delete event.lucid__indexedTags;
        channel.send(['EVENT', sid, event]);
      }).get();
    });
    this.subscriptions.set(`${channel.id}${TAG_SEP}${sid}`, { channel, queries });
  }
  removeSubscription (sid, channel) {
    if (!this.running) throw new Error(`Cannot remove subscription while not running.`);
    this.debug.verbose(`Removing subscription ${sid} for relay instance ${channel.id}.`);
    const { queries } = this.subscriptions.get(`${channel.id}${TAG_SEP}${sid}`) || {};
    (queries || []).forEach(q => q.off('add'));
  }
  removeAllSubscriptions (channel) {
    [...this.subscriptions.keys()]
      .map(k => k.split(TAG_SEP))
      .filter(([chan]) => chan === channel.id)
      .forEach(([, sid]) => this.removeSubscription(sid, channel))
    ;
  }
  filtersToQueries (filters) {
    if (!this.running) throw new Error(`Cannot generate queries while not running.`);
    return filters.map(filter => {
      let q = this.db.query('events');
      Object.entries(filter).forEach(([k, v]) => {
        if (k === 'ids') q = q.filter('id', 'in', v);
        else if (k === 'authors') q = q.filter('pubkey', 'in', v);
        else if (k === 'kinds') q = q.filter('kind', 'in', v);
        else if (k === 'since') q = q.filter('created_at', '>=', v);
        else if (k === 'until') q = q.filter('created_at', '<=', v);
        else if (k === 'limit') q = q.take(v);
        else if (/^#\w/.test(k)) {
          const tag = k.replace(/^#/, '');
          v.forEach(val => {
            q = q.filter('lucid__indexedTags', 'contains', `${tag}${TAG_SEP}${val}`);
          });
        }
      });
      return q;
    });
  }
  async run () {
    this.debug.log(`Augury starting up…`);
    this.running = true;
    this.db = new AceBase('nostr', { storage: { path: this.store }, logLevel: 'error' });
    await this.db.ready();
    this.debug.log(`- database ready`);
    await Promise.all(
      ['pubkey', 'kind', 'created_at', ].map(k => this.db.indexes.create('events', k))
    );
    await this.db.indexes.create('events', 'lucid__indexedTags', { type: 'array' });
    const app = express();
    const api_url = '/api/nip96';
    const makeAPIURL = (req) => `${req.get('x-forwarded-proto') || req.protocol}://${req.get('host')}${api_url}`;
    // we allow full path control
    app.use((req, res, next) => {
      res.setHeader('access-control-allow-origin', '*');
      res.setHeader('access-control-allow-methods', 'get, post, delete');
      res.setHeader('access-control-allow-headers', 'authorization');
      next();
    });
    app.use(fileUpload({
      // debug: true,
      abortOnLimit: true,
      useTempFiles: true,
      tempFileDir: join(this.store, 'tmp'),
      parseNested: true, // lol, not in the spec
    }));
    // subdomains first
    app.get('/', async (req, res, next) => {
      const host = req.hostname;
      this.debug.log(`Serving / for ${host}`);
      if (!/\w+\.ipfs\./.test(host)) return next();
      const cid = host.replace(/\.ipfs\..+/, '');
      const meta = await this.db.ref(`cids/${cid}`).get();
      if (!meta.exists()) {
        this.debug.warn(`Serving / for ${host} not found.`);
        return res.status(404).send({ status: 'failure', message: 'Not found!' });
      }
      const { content_type: mediaType } = meta.val();
      this.debug.success(`➯ ${cid} (${mediaType})`);
      res.type(mediaType).sendFile(cid, makeSendOptions(this.store));
    });
    app.get('/.well-known/nostr/nip96.json', (req, res) => {
      this.debug.success(`➯ /.well-known/nostr/nip96.json`);
      // console.warn(req);
      res.send({ api_url: makeAPIURL(req), ipfs: true });
    });
    app.post(api_url, async (req, res) => {
      this.debug.log(`Upload to ${api_url}`);
      let pubkey;
      try {
        // NOTE: note sure about case sensitivity in case the nip98 is passed from a form.
        pubkey = isValidAuthorizationHeader(
          req.headers.authorization || req.body?.Authorization || req.body?.authorization,
          'POST',
          makeAPIURL(req), // this may be incorrect but should work
          this.posters
        );
      }
      catch (e) {
        this.debug.warn(`401 for upload: ${e.message}.`);
        return res.status(401).send({ error: e.message });
      }
      if (!req.files?.file) {
        this.debug.warn(`400 for upload: No file uploaded.`);
        return res.status(400).send({ error: 'No file uploaded.' });
      }
      // This is a fucking mess.
      const file = Array.isArray(req.files.file) ? (req.files.file[0] || req.files.file['']) : req.files.file;
      const cid = await fromStream(createReadStream(file.tempFilePath));
      const storedFile = join(this.store, cid);
      // getting the right media type is work
      // trust, in order: the person uploading, the magic bytes, the provided file name, a default
      let content_type = req.body?.content_type;
      if (!content_type) content_type = (await fileTypeFromFile(file.tempFilePath))?.mime;
      if (!content_type && file.name) content_type = mime.lookup(file.name);
      if (!content_type) content_type = 'application/octet-stream';
      file.mv(storedFile, async (err) => {
        if (err) {
          this.debug.error(`500 Could not move file.`);
          return res.status(500).send({ error: 'Could not move file.' });
        }
        await this.db.ref(`cids/${cid}`).set({
          alt: req.body?.alt || null, // nip96 recommended
          media_type: req.body?.media_type || null, // WARNING: this is not a media type, but avatar|banner to indicate usage
          content_type,
        });
        await this.db.ref(`cids/${cid}/owners/${pubkey}`).set({ ts: new Date().toISOString() });
        const ox = await sha256FromStream(createReadStream(storedFile));
        this.debug.success(`➯ Uploaded ${cid} for ${pubkey}`);
        res.status(201).send({
          status: 'success',
          message: 'created',
          nip94_event: {
            tags: [
              ['url', cidSubdomain(req, cid)],
              ['ox', ox],
              ['cid', cid], // extension to nip94
            ],
          },
        });
      });
    });
    // For compatibility with nip96 that isn't very flexible, we redirect to the actually useful URL
    app.get(`${api_url}/:cid`, (req, res) => {
      const cid = req.params.cid.replace(/\.\w+$/, ''); // remove extension if there
      this.debug.log(`Redirect 308 from ${api_url}/${cid}`);
      res.redirect(308, cidSubdomain(req, cid));
    });
    app.delete(`${api_url}/:cid`, async (req, res) => {
      const cid = req.params.cid.replace(/\.\w+$/, ''); // remove extension if there
      this.debug.log(`Deleting ${cid}`);
      let pubkey;
      try {
        // NOTE: note sure about case sensitivity in case the nip98 is passed from a form.
        pubkey = isValidAuthorizationHeader(
          req.headers.authorization || req.body?.Authorization || req.body?.authorization,
          'DELETE',
          `${makeAPIURL(req)}${req.params.cid}`,
          this.posters
        );
      }
      catch (e) {
        this.debug.warn(`401 for deletion: ${e.message}.`);
        res.status(401).send({ error: e.message });
      }
      await this.db.ref(`cids/${cid}/owners/${pubkey}`).remove();
      const owns = await this.db.ref(`cids/${cid}/owners`).get();
      let isEmpty = false;
      if (owns.exists()) {
        isEmpty = !Object.keys(owns.val()).length;
      }
      else {
        isEmpty = true;
      }
      // if there are no owners left, we remove
      if (isEmpty) {
        this.debug.log(`${cid} has no owners left`);
        await this.db.ref(`cids/${cid}`).remove();
        await rm(join(this.store, cid));
      }
      this.debug.success(`➯ Deleted ${cid} for ${pubkey}`);
      res.send({
        status: 'success',
        message: 'Resource deleted',
      });
    });
    this.http = app.listen(this.port);
    this.debug.log(`- HTTP server listening on port ${this.port}`);
    this.wss = new WebSocketServer({ server: this.http, clientTracking: true });
    this.debug.log(`- Web Socket server listening`);
    this.wss.on('connection', (s) => {
      this.debug.log(`New connection`);
      const nr = new RelayInstance(s, this);
      s.on('message', async (msg) => await nr.message(msg));
      s.on('close', () => nr.close());
      s.on('error', err => this.debug.error(`Web socket error`, err));
    });
    this.debug.success(`Augury running at wss://localhost:${this.port}/.`);
  }
  async stop (force) {
    this.debug.log(`Augury shutting down…`);
    return Promise.all([
      this.db ? this.db.close() : Promise.resolve(),
      this.http
        ? new Promise((resolve) => {
            this.http.close(resolve);
            // yes, it's normal that this is called *after*
            if (force) this.http.closeAllConnections();
          })
        : Promise.resolve(),
      this.wss
        ? new Promise((resolve) => {
            this.wss.close(resolve);
            if (force) [...this.wss.clients].forEach(c => c.terminate());
          })
        : Promise.resolve(),
    ]);
  }
}

class RelayInstance {
  constructor (s, p) {
    this.socket = s;
    this.parent = p;
    this.debug = this.parent.debug;
    this.id = nanoid();
  }
  send (msg) {
    this.debug.verbose(JSON.stringify(msg));
    this.socket.send(JSON.stringify(msg));
  }
  close () {
    this.debug.log(`Closing channel ${this.id}`);
    this.socket.close();
    this.parent.removeAllSubscriptions(this);
  }
  addSubscription (sid, filters) {
    this.parent.addSubscription(sid, this, filters);
  }
  removeSubscription (sid) {
    this.parent.removeSubscription(sid, this);
  }
  async message (msg) {
    try { msg = JSON.parse(msg); }
    catch (e) {
      this.debug.warn(`Unable to parse message (${this.id})`);
      this.send(['NOTICE', 'Unable to parse message']);
    }

    let verb, payload;
    try { [verb, ...payload] = msg; }
    catch (e) {
      this.debug.warn(`Unable to read message (${this.id})`);
      this.send(['NOTICE', 'Unable to read message']);
    }

    const handler = this[`on${verb}`];
    if (handler) {
      try {
        await handler.call(this, ...payload);
      }
      catch (err) {
        this.debug.warn(`${err.message} (${this.id})`);
      }
    }
    else {
      this.debug.warn(`Unable to handle message (${this.id})`);
      this.send(['NOTICE', 'Unable to handle message']);
    }
  }
  async onCLOSE (sid) {
    this.debug.log(`Closing subscription ${sid} (${this.id})`);
    this.removeSubscription(sid);
  }
  async onREQ (sid, ...filters) {
    this.debug.log(`New subscription ${sid} (${this.id})`);
    await this.parent.runQuery(sid, this, filters);
    this.send(['EOSE', sid]);
    this.debug.log(`Send EOSE for ${sid}, now listening (${this.id})`);
    this.addSubscription(sid, filters);
  }
  async onEVENT (event) {
    this.debug.log(`Event ${event.kind} id=${event.id} for ${event.pubkey} (${this.id})`);
    if (!verifyEvent(event)) throw new Error('Event does not appear to be valid.');
    if (!this.parent.posters.has(event.pubkey)) throw new Error('User is not accepted on this server.');
    await this.parent.storeEvent(event);
    this.send(['OK', event.id, true]);
  }
}

// Taken from https://github.com/nosdav/passport-nostr/.
// Would reuse, but not exported and the default won't do full nip96.
// Made it throw so that caller can deal with error
function isValidAuthorizationHeader (authorization, method, url, posters) {
  if (!authorization) throw new Error(`No authorization string.`);
  const base64String = authorization.replace(/Nostr\s+/, '');
  const decodedString = Buffer.from(base64String, 'base64').toString('utf-8');
  if (!decodedString) throw new Error(`No authorization string.`);
  const event = JSON.parse(decodedString);
  console.warn();
  if (event.kind !== 27235) throw new Error(`Failure: event.kind is "${event.kind}" instead of 27235.`);
  if (!event.tags.find(tag => tag[0] === 'method' && tag[1] === method)) {
    throw new Error('No matching method tag found.');
  }
  if (!event.tags.find(tag => tag[0] === 'u' && tag[1] === url)) {
    throw new Error(`No matching u tag found. Expected u: "${url}"`);
  }
  // 60 seconds window
  if (Math.abs(event.created_at - Math.floor(Date.now() / 1000)) > 60) {
    throw new Error('Timestamp is not within the 60 second window.');
  }
  if (!verifyEvent(event)) throw new Error('Event does not appear to be valid.');
  if (!posters.has(event.pubkey)) throw new Error('User is not accepted on this server.');
  return event.pubkey;
}

async function sha256FromStream (s) {
  const sh = await createSHA256();
  sh.init();
  return new Promise((resolve, reject) => {
    s.on('data', (chunk) => sh.update(chunk));
    s.on('error', reject);
    s.on('end', async () => resolve(sh.digest('hex')));
  });
}

function cidSubdomain (req, cid) {
  return `${req.get('x-forwarded-proto') || req.protocol}://${cid}.ipfs.${req.get('host')}/`;
}
