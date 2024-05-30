
// import { equal, throws } from 'node:assert';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import getPort from 'get-port';
import WebSocket from 'ws';
import { useWebSocketImplementation, Relay } from 'nostr-tools/relay';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import InterplanetaryNostrum from '../nostr.js';

let sk, pk, store, relay, client;

// XXX
// - connect
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
after(async function () {
  this.timeout(100 * 1000)
  console.warn('aftering');
  return relay.stop(true);
});
describe('Nostr Basics', () => {
  it('relay is running', (done) => {
    const sub = client.subscribe([
      { kinds: [1] },
    ],
    {
      onevent (ev) {
        console.warn('event:', ev);
      },
      oneose () {
        console.warn('EOSE');
        sub.close();
        done();
      },
    })
  });
});
