

self.importScripts('./ipld-decode.js');

let curCID;
let loading = Promise.resolve();
let curManifest;
self.onmessage = async (ev) => {
  console.warn(`[SW] ${ev.data?.cid}`);
  curCID = ev.data?.cid;
  loading = fetchManifest(curCID);
  await loading;
  ev.source.postMessage({ state: 'ready' /*, manifest: curManifest */ });
};

self.addEventListener('fetch', async (ev) => {
  const url = new URL(ev.request.url);
  if (/^\/\.well-known\/lucid\b/.test(url.pathname)) return;
  if (!curCID) return ev.respondWith(new Response('No CID available yet.', { status: 200, headers: { 'content-type': 'text/plain' } }));
  await loading;
  if (!curManifest) return ev.respondWith(new Response(`Could not load tile manifest for CID ${curCID}`, { status: 404, headers: { 'content-type': 'text/plain' } }));
  const res = curManifest.resources?.[url.pathname];
  if (!res) return ev.respondWith(new Response(`Not found: ${url.pathname.replace(/</g, '&gt;')}`, { status: 404, headers: { 'content-type': 'text/plain' } }));
  // Here we have to be careful not to have a nested await (of a fetch at least).
  ev.respondWith(fetch(cidToHTTP(res.src)), { status: 200, headers: { 'content-type': res.mediaType } });
});

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
