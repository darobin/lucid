
import { ok, equal, deepStrictEqual, notEqual } from 'node:assert';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { tmpdir } from 'node:os';
import { nextTick } from 'node:process';
import getPort from 'get-port';
import WebSocket from 'ws';
import { useWebSocketImplementation, Relay } from 'nostr-tools/relay';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import InterplanetaryNostrum from '../nostr.js';

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
  it('NIP-96', async () => {
    const res = await fetch(`http://localhost:${port}/.well-known/nostr/nip96.json`);
    const nip96 = await res.json();
    deepStrictEqual(nip96, { api_url: '/api/nip96' });
  });
  it('NIP-98 authorization', async () => {
    const url = `http://localhost:${port}/api/nip96`;
    const checkUpload = async (authzEvent, pubkey) => {
      const headers = {};
      if (authzEvent) {
        const fev = finalizeEvent(authzEvent, sk);
        if (pubkey) fev.pubkey = pubkey;
        headers.authorization = `Nostr ${Buffer.from(JSON.stringify(fev)).toString('base64')}`;
      }
      const res = await fetch(url, { method: 'post', headers });
      return res.status;
    };
    const templateEvent = () => {
      return {
        kind: 27235,
        tags: [
          ['method', 'POST'],
          ['u', url],
        ],
        content: '',
        created_at: Math.floor(Date.now() / 1000) - 10,
        pubkey: pk,
      };
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
});


// XXX
// - post content to API
// - retrieve content off gateway


function now () {
  return Math.floor(Date.now() / 1000);
}
