
let curSWReg;
let curIFrame;

const srcEl = document.getElementById('src');
const iconEl = document.getElementById('icon');
const nameEl = document.getElementById('name');
const descEl = document.getElementById('desc');
const renderEl = document.getElementById('render');
const updateBut = document.getElementById('update');

function updateSourceBar (cid) {
  srcEl.textContent = `web+tile://${cid}/`;
}

let currentCID; 
window.addEventListener('hashchange', updateCurrentCID);
function updateCurrentCID () {
  currentCID = (window.location.hash || '').replace('#', '');
  console.warn(`Updating CID to ${currentCID}`);
  loadTile(currentCID);
}
updateCurrentCID();

const sse = new EventSource('/.well-known/lucid/events');
sse.addEventListener('new-cid', (ev) => {
  const { cid } = JSON.parse(ev.data);
  updateSourceBar(cid);
  if (cid === currentCID) return;
  window.location.hash = `#${cid}`;
});

async function loadTile (cid) {
  // console.warn(`Load tile ${cid}`);
  // if (curSWReg) {
  //   console.warn(`Unloading previous tile…`);
  //   await curSWReg.unregister();
  //   console.warn(`registration installing? ${!!curSWReg.installing}, waiting? ${!!curSWReg.waiting}`);
  //   console.warn(navigator.serviceWorker);
  // }
  if (!curSWReg) {
    curSWReg = await navigator.serviceWorker.register('sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
  }
  curSWReg.active.postMessage({ cid });
  console.warn(`waiting for service worker to signal load ${cid}`);
}

navigator.serviceWorker.addEventListener("controllerchange", () => {
  console.warn("The controller of current browsing context has changed.");
});

// XXX
// - use this to get a new manifest, and show name, desc, icons under the bar
navigator.serviceWorker.onmessage = (ev) => {
  console.warn(`SW loaded`, ev.data);
  if (ev.data?.state === 'ready') {
    if (curIFrame) curIFrame.remove();
    curIFrame = document.createElement('iframe');
    renderEl.append(curIFrame);
    curIFrame.src = '/';
    curIFrame.setAttribute('frameborder', '0')
    iconEl.textContent = null;
    if (ev.data.manifest?.icons?.[0]?.src) {
      const img = document.createElement('img');
      img.setAttribute('width', '48');
      img.setAttribute('height', '48');
      img.setAttribute('src', ev.data.manifest.icons[0].src);
      iconEl.append(img);
    }
    nameEl.textContent = ev.data.manifest?.name;
    descEl.textContent = ev.data.manifest?.description;
  }
};

updateBut.addEventListener('click', async () => {
  if (curSWReg) await curSWReg.update();
  window.location.reload();
});
