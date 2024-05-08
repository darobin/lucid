
const srcEl = document.getElementById('src');
function updateSourceBar (cid) {
  srcEl.textContent = `web+tile://${cid}/`;
}

let currentCID; 
document.addEventListener('hashchange', updateCurrentCID);
function updateCurrentCID () {
  currentCID = (window.location.hash || '').replace('#', '');
  updateSourceBar();
}
updateCurrentCID();

const sse = new EventSource('/.well-known/lucid/events');
sse.addEventListener('data', (ev) => {
  console.warn(`DATA`, ev.data);
  const { cid } = JSON.parse(ev.data);
  if (cid === currentCID) return;
  window.location.hash = `#${cid}`;
});

// - update pre with tile address
// - how do we set up the frame/worker
  // - iframe loads / (after SW is instantiated)
