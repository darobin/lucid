
const srcEl = document.getElementById('src');
function updateSourceBar (cid) {
  srcEl.textContent = `web+tile://${cid}/`;
}

let currentCID; 
document.addEventListener('hashchange', updateCurrentCID);
function updateCurrentCID () {
  currentCID = (window.location.hash || '').replace('#', '');
}
updateCurrentCID();

const sse = new EventSource('/.well-known/lucid/events');
sse.addEventListener('new-cid', (ev) => {
  console.warn(`DATA`, ev.data);
  const { cid } = JSON.parse(ev.data);
  updateSourceBar(cid);
  if (cid === currentCID) return;
  window.location.hash = `#${cid}`;
});

// - update pre with tile address
// - how do we set up the frame/worker
  // - iframe loads / (after SW is instantiated)
