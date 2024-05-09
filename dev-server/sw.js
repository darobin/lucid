
// the SW
// - SW gets data from ${CID}.ipfs.localhost (need to respond to host) by mapping from the host
// - set CSP from SW

let curCID;

self.onmessage = (ev) => {
  curCID = ev.data?.cid;
};

self.addEventListener('fetch', (ev) => {
  const url = new URL(ev.request.url);
  if (/^\/\.well-known\/lucid\b/.test(url.pathname)) return;
  if (!curCID) {
    return ev.respondWith(new Response('No CID available yet.', { status: 200, headers: { 'content-type': 'text/plain' } }));
  }
  return ev.respondWith(new Response(`Serving for CID: ${curCID}`, { status: 200, headers: { 'content-type': 'text/plain' } }));
});
