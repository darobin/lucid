
let curSWReg;
let curIFrame;

const srcEl = document.getElementById('src');
const renderEl = document.getElementById('render');
function updateSourceBar (cid) {
  srcEl.textContent = `web+tile://${cid}/`;
}

let currentCID; 
document.addEventListener('hashchange', updateCurrentCID);
function updateCurrentCID () {
  currentCID = (window.location.hash || '').replace('#', '');
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
  if (curSWReg) {
    console.warn(`Unloading previous tile…`);
    await curSWReg.unregister();
  }
  curSWReg = await navigator.serviceWorker.register('sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  curSWReg.active.postMessage({ cid });
  if (curIFrame) curIFrame.remove();
  curIFrame = document.createElement('iframe');
  // arbitrarily, the dimensions of a Galaxy Note S20
  curIFrame.setAttribute('width', '412');
  curIFrame.setAttribute('height', '883');
  renderEl.append(curIFrame);
  curIFrame.src = '/';
}
