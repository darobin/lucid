
import { ok, equal } from 'node:assert';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { nextTick } from 'node:process';
import getPort from 'get-port';
import WebSocket from 'ws';
import { useWebSocketImplementation, Relay } from 'nostr-tools/relay';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import InterplanetaryNostrum from '../nostr.js';

let sk, pk, store, relay, client;

// XXX
// - send event
// - subscribe
// - retrieve some events with filters
// - check nip96
// - post content to API
// - check that auth works
// - retrieve content off gateway
before(async () => {
  useWebSocketImplementation(WebSocket);
  sk = generateSecretKey();
  pk = getPublicKey(sk);
  const port = await getPort();
  store = await mkdtemp(join(tmpdir(), 'lucid-'));
  relay = new InterplanetaryNostrum({ port, store, posters: [pk] });
  await relay.run();
  client = await Relay.connect(`ws://localhost:${port}`);
});
after(async () => {
  return relay.stop(true);
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
    console.warn(`sending event 1`);
    await client.publish(firstEvent);
    let seenEOSE = false;
    let timeoutID;
    const sub = client.subscribe([
        { kinds: [1] },
      ],
      {
        onevent (ev) {
          console.warn(`====== ${ev.content} ====`);
          console.warn(`event`, ev);
          if (ev.content === 'first') {
            ok(!seenEOSE, 'happened before EOSE');
            ok(true, 'got first event');
            console.warn(`RESOLVING ONE`);
            gotFirstEvent();
          }
          else if (ev.content === 'second') {
            clearTimeout(timeoutID);
            gotSecondEvent('second event matched');
            ok(false, 'got second event');
          }
          else if (ev.content === 'third') {
            console.warn(`RESOLVING THIRD, ${seenEOSE}`);
            ok(seenEOSE, 'happened after EOSE');
            ok(true, 'got third event');
            sub.close();
            gotThirdEvent();
          }
        },
        async oneose () {
          console.warn(`RESOLVING EOSE`);
          seenEOSE = true;
          ok(true, 'got EOSE');
          gotEOSE();
          timeoutID = setTimeout(() => timeoutWithoutSecondEvent, 200);
          console.warn(`sending event 2, kind = ${secondEvent.kind}`);
          await client.publish(secondEvent);
          console.warn(`sending event 3`);
          await client.publish(thirdEvent);
        },
    });
    console.warn(`before await`);
    return allThings;
    // done();
  });
});

function now () {
  return Math.floor(Date.now() / 1000);
}
