

self.importScripts('./ipld-decode.js');

// the SW
// - SW gets data from ${CID}.ipfs.localhost (need to respond to host) by mapping from the host
// - set CSP from SW

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
  console.warn(`Fetch for ${url.pathname} (${url.hostname})`);
  if (/^\/\.well-known\/lucid\b/.test(url.pathname)) return;
  console.warn(`Did not match .wk for lucid`);
  if (!curCID) return ev.respondWith(new Response('No CID available yet.', { status: 200, headers: { 'content-type': 'text/plain' } }));
  console.warn(`Have a CID=${curCID}`);
  // // return ev.respondWith(new Response(`CID served ${curCID}`, { status: 200, headers: { 'content-type': 'text/plain' } }));
  await loading;
  console.warn(`Done loading`);
  if (!curManifest) return ev.respondWith(new Response(`Could not load tile manifest for CID ${curCID}`, { status: 404, headers: { 'content-type': 'text/plain' } }));
  console.warn(`Have manifest=${JSON.stringify(curManifest)}`);
  const res = curManifest.resources?.[url.pathname];
  console.warn(`Have res=${JSON.stringify(res)}`);


  // XXX status: up to here, this works
  // the two lines below the next line, when they were above, had a race condition… keep moving bits up until it works
  // I suspect that the recursed fetch might be what fails — either don't await it, or just use fetch(cidToHTTP(cid)) directly
  // THIS LAST BIT

  ev.respondWith(fetch('http://bafkr4igtrzvbqw3wshqujdhvscbd4jfnglovn3hizefgc432gtlnj3twgq.ipfs.localhost:3210/'));
  // if (!res) return ev.respondWith(new Response(`Not found: ${url.pathname.replace(/</g, '&gt;')}`, { status: 404, headers: { 'content-type': 'text/plain' } }));
  // return ev.respondWith(new Response(await fetchCIDAsArrayBuffer(res.src), { status: 200, headers: { 'content-type': res.mediaType } }));
  // // return ev.respondWith(new Response(`CID served ${curCID}`, { status: 200, headers: { 'content-type': 'text/plain' } }));
  // // return ev.respondWith(new Response(JSON.stringify(LOG, null, 2), { status: 200, headers: { 'content-type': 'text/plain' } }));
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
