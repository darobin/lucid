

self.importScripts('./ipld-decode.js');

let curCID;
let loading = Promise.resolve();
let curManifest;
self.onmessage = async (ev) => {
  console.warn(`[SW] ${ev.data?.cid}`);
  curCID = ev.data?.cid;
  loading = fetchManifest(curCID);
  await loading;
  ev.source.postMessage({ state: 'ready', manifest: curManifest });
};

self.addEventListener('fetch', async (ev) => {
  const url = new URL(ev.request.url);
  if (/^\/\.well-known\/lucid\b/.test(url.pathname)) return;
  if (!curCID) return ev.respondWith(new Response('No CID available yet.', response()));
  await loading;
  if (!curManifest) return ev.respondWith(new Response(`Could not load tile manifest for CID ${curCID}`, response(404)));
  const res = curManifest.resources?.[url.pathname];
  if (!res) return ev.respondWith(new Response(`Not found: ${url.pathname.replace(/</g, '&gt;')}`, response(404)));
  // Here we have to be careful not to have a nested await (of a fetch at least).
  ev.respondWith(fetch(cidToHTTP(res.src)), response(200, res.mediaType));
});

function response (status = 200, mediaType = 'text/plain', headers = {}) {
  return {
    status,
    headers: {
      ...headers,
      'content-type': mediaType,
      // we have this on the iframe instead, for now
      // 'content-security-policy': [
      //   `default-src 'self'`,
      //   `style-src 'self' 'unsafe-inline'`,
      //   `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval';`,
      //   `img-src 'self' blob: data:;`,
      //   `media-src 'self' blob: data:;`,
      // ].join(' '),
    },
  };
}

function cidToHTTP (cid) {
  return `http://${cid}.ipfs.${self.location.host}/`;
}

async function fetchCIDAsArrayBuffer (cid) {
  try {
    console.warn(`Fetch of ${cidToHTTP(cid)}`);
    const r = await fetch(cidToHTTP(cid));
    console.warn(`  GOT ${r.status}: ${r.statusText}`);
    return await r.arrayBuffer();
  }
  catch (err) {
    console.error(`BOOM`, err);
  }
}

async function fetchManifest (cid) {
  console.warn(`in fecthMan`);
  curManifest = self.decodeIPLD(await fetchCIDAsArrayBuffer(cid));
  Object.values(curManifest.resources).forEach(r => {
    if (typeof r.src !== 'string') r.src = r.src.toString();
  });
}
