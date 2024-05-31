
import { ok, equal, deepStrictEqual, notEqual } from 'node:assert';
import { join } from 'node:path';
import { mkdtemp, readFile } from 'node:fs/promises';
import { Buffer, File } from 'node:buffer';
import { tmpdir } from 'node:os';
import { nextTick } from 'node:process';
import getPort from 'get-port';
import WebSocket from 'ws';
import { useWebSocketImplementation, Relay } from 'nostr-tools/relay';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import InterplanetaryNostrum from '../nostr.js';
import makeRel from '../lib/rel.js';

const rel = makeRel(import.meta.url);
let sk, pk, store, relay, client, port;

before(async () => {
  useWebSocketImplementation(WebSocket);
  sk = generateSecretKey();
  pk = getPublicKey(sk);
  port = await getPort();
  store = await mkdtemp(join(tmpdir(), 'lucid-'));
  relay = new InterplanetaryNostrum({ port, store, posters: [pk] });
  await relay.run();
  client = await Relay.connect(`ws://localhost:${port}`);
});
after(async () => {
  return relay.stop(true);
});
afterEach(async () => {
  return relay.db.ref('events').remove();
});
describe('Nostr Basics', () => {
  it('relay is running (no events)', (done) => {
    let sawNothing = true;
    const sub = client.subscribe([
        { kinds: [1] },
      ],
      {
        onevent () {
          sawNothing = false;
        },
        oneose () {
          ok(sawNothing, 'no events before we closed');
          sub.close();
          done();
        },
    });
  });
  it('subscriptions (minimal)', async () => {
    let allOK;
    const done = new Promise((resolve) => allOK = resolve);
    const firstEvent = finalizeEvent({
      kind: 1,
      created_at: now(),
      tags: [],
      content: 'first',
    }, sk);
    const secondEvent = finalizeEvent({
      kind: 1,
      created_at: now(),
      tags: [],
      content: 'second',
    }, sk);
    await client.publish(firstEvent);
    const sub = client.subscribe([
        { kinds: [1] },
      ],
      {
        async onevent (ev) {
          if (ev.content === 'first') {
            ok(true, 'got first event');
            nextTick(() => client.publish(secondEvent));
          }
          else if (ev.content === 'second') {
            ok(true, 'got second event');
            allOK();
            sub.close();
          }
        },
    });
    return done;
  });
  it('subscriptions (more complex)', async () => {
    let gotFirstEvent, gotEOSE, timeoutWithoutSecondEvent, gotSecondEvent, gotThirdEvent;
    const allThings = Promise.all([
      new Promise((resolve) => gotFirstEvent = resolve),
      new Promise((resolve) => gotEOSE = resolve),
      new Promise((resolve, reject) => {
        timeoutWithoutSecondEvent = resolve;
        gotSecondEvent = reject;
      }),
      new Promise((resolve) => gotThirdEvent = resolve),
    ]);
    const firstEvent = finalizeEvent({
      kind: 1,
      created_at: now(),
      tags: [],
      content: 'first',
    }, sk);
    const secondEvent = finalizeEvent({
      kind: 2,
      created_at: now(),
      tags: [],
      content: 'second',
    }, sk);
    const thirdEvent = finalizeEvent({
      kind: 1,
      created_at: now(),
      tags: [],
      content: 'third',
    }, sk);
    await client.publish(firstEvent);
    let seenEOSE = false;
    let timeoutID;
    const sub = client.subscribe([
        { kinds: [1] },
      ],
      {
        onevent (ev) {
          if (ev.content === 'first') {
            ok(!seenEOSE, 'happened before EOSE');
            ok(true, 'got first event');
            gotFirstEvent();
          }
          else if (ev.content === 'second') {
            clearTimeout(timeoutID);
            gotSecondEvent('second event matched');
            ok(false, 'got second event');
          }
          else if (ev.content === 'third') {
            ok(seenEOSE, 'happened after EOSE');
            ok(true, 'got third event');
            sub.close();
            gotThirdEvent();
          }
        },
        async oneose () {
          seenEOSE = true;
          ok(true, 'got EOSE');
          gotEOSE();
          timeoutID = setTimeout(timeoutWithoutSecondEvent, 200);
          await client.publish(secondEvent);
          await client.publish(thirdEvent);
        },
    });
    return allThings;
  });
  it('NIP-96 metadata', async () => {
    const res = await fetch(`http://localhost:${port}/.well-known/nostr/nip96.json`);
    const nip96 = await res.json();
    deepStrictEqual(nip96, { api_url: '/api/nip96' });
  });
  it('NIP-98 authorization', async () => {
    const checkUpload = async (authzEvent, pubkey) => {
      const headers = {};
      if (authzEvent) {
        const fev = finalizeEvent(authzEvent, sk);
        if (pubkey) fev.pubkey = pubkey;
        headers.authorization = `Nostr ${Buffer.from(JSON.stringify(fev)).toString('base64')}`;
      }
      const res = await fetch(nip96URL(), { method: 'post', headers });
      return res.status;
    };
    equal(401, await checkUpload(), 'No auth gets 401');
    const badKind = templateEvent();
    badKind.kind = 3;
    equal(401, await checkUpload(badKind), 'Wrong kind gets 401');
    const badMeth = templateEvent();
    badMeth.tags[0][1] = 'patch';
    equal(401, await checkUpload(badMeth), 'Wrong method gets 401');
    const badURL = templateEvent();
    badURL.tags[1][1] = 'https://berjon.com/';
    equal(401, await checkUpload(badURL), 'Wrong URL gets 401');
    const badPast = templateEvent();
    badPast.created_at -= 120;
    equal(401, await checkUpload(badPast), 'Wrong creation (past) gets 401');
    const badFuture = templateEvent();
    badFuture.created_at += 120;
    equal(401, await checkUpload(badFuture), 'Wrong creation (future) gets 401');
    const badPerson = templateEvent();
    equal(401, await checkUpload(badPerson, 'aaaaaaaa'), 'Wrong person gets 401');
    notEqual(401, await checkUpload(templateEvent()), 'Correct event does not get 401');
  });
  it('NIP-96 upload', async function () {
    this.timeout(10 * 1000);
    const cid = 'bafkr4idcy33utsake6atvbagnojkn7odp7mdo6n7tvspd4ndnewphj67xu';
    const wtfBuf = await readFile(rel('./fixtures/wtf.jpg'));
    const wtf = new File([wtfBuf.buffer], 'wtf.jpg', { type: 'image/jpeg' });
    const body = new FormData();
    body.append('file', wtf, 'wtf.jpg');
    body.append('alt', 'The Wonderful WTF Cat');
    body.append('content_type', 'image/jpeg');

    const postEvent = templateEvent();
    const authorization = `Nostr ${Buffer.from(JSON.stringify(finalizeEvent(postEvent, sk))).toString('base64')}`;
    const res = await fetch(nip96URL(), {
      method: 'post',
      headers: { authorization }, // don't specify content-type, it interferes with FormData DTRT
      body,
    });
    equal(201, res.status, 'created');
    const data = await res.json();
    equal('success', data.status, 'status correct');
    equal('created', data.message, 'message correct');
    let url94, ox94, cid94;
    data.nip94_event.tags.forEach(([k, v]) => {
      if (k === 'url') url94 = v;
      else if (k === 'ox') ox94 = v;
      else if (k === 'cid') cid94 = v;
    })
    const gatewayURL = `http://${cid}.ipfs.localhost:${port}/`;
    equal(gatewayURL, url94, 'URL correct');
    equal(cid, cid94, 'CID correct');
    equal('c7d01489080858c500065836c658f847a6ca67c4864619212be4f8200e4bbace', ox94, 'SHA correct');

    const dbEntry = (await relay.db.ref(`cids/${cid}`).get()).val();
    equal('The Wonderful WTF Cat', dbEntry.alt, 'alt ok');
    equal('image/jpeg', dbEntry.content_type, 'media type ok');

    // const gtw = await fetch(gatewayURL);
    // we override the host header because Node's fetch does not resolve localhost subdomains the way browsers do
    const gtw = await fetch(`http://localhost:${port}/`, { headers: { host: `${cid}.ipfs.localhost:${port}` }});
    equal(200, gtw.status, 'gateway resource is there');
    equal('image/jpeg', gtw.headers.get('content-type'), 'media type is correct');
    const jpeg = await gtw.arrayBuffer();
    // compare should be 0
    ok(!wtfBuf.compare(Buffer.from(jpeg)), 'the resource is what we uploaded');

    // XXX
    // - delete
    // - check that you don't get it back
  });
});


// XXX
// - post content to API
// - retrieve content off gateway


function now () {
  return Math.floor(Date.now() / 1000);
}

function templateEvent () {
  return {
    kind: 27235,
    tags: [
      ['method', 'POST'],
      ['u', nip96URL()],
    ],
    content: '',
    created_at: Math.floor(Date.now() / 1000) - 10,
    pubkey: pk,
  };
}

function nip96URL () {
  return `http://localhost:${port}/api/nip96`;
}
