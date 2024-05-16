
let curSWReg;
let curIFrame;

const srcEl = document.getElementById('src');
const renderEl = document.getElementById('render');
const updateBut = document.getElementById('update');

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
  console.warn(`waiting for message…`);
}

// XXX
// - use this to get a new manifest, and show name, desc, icons under the bar
navigator.serviceWorker.onmessage = (ev) => {
  console.warn(`Got message`, ev);
  if (ev.data?.state === 'ready') {
    if (curIFrame) curIFrame.remove();
    curIFrame = document.createElement('iframe');
    // arbitrarily, the dimensions of a Galaxy Note S20
    curIFrame.setAttribute('width', '412');
    curIFrame.setAttribute('height', '883');
    renderEl.append(curIFrame);
    curIFrame.src = '/';
    // const r = await fetch('http://bafkr4igtrzvbqw3wshqujdhvscbd4jfnglovn3hizefgc432gtlnj3twgq.ipfs.localhost:3210/');
    // console.warn(`res`, r);
  }
};

updateBut.addEventListener('click', async () => {
  if (curSWReg) await curSWReg.update();
  window.location.reload();
});
