// Preview app: pick a design ticket (and screen), render its prototype in a sandboxed iframe.
// The prototype list comes from the dev-server middleware (/api/designs), scanned at request time.
const ticketSel = document.getElementById("ticket");
const screenSel = document.getElementById("screen");
const screenWrap = document.getElementById("screen-wrap");
const frame = document.getElementById("frame");
const empty = document.getElementById("empty");
const statusEl = document.getElementById("status");
const refreshBtn = document.getElementById("refresh");

let designs = [];

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function currentTicket() {
  return designs.find((d) => d.ticket === ticketSel.value) || null;
}

function render() {
  const d = currentTicket();
  if (!d) {
    frame.removeAttribute("src");
    return;
  }
  const screen = screenSel.value || d.screens[0];
  frame.src = `/prototype/${encodeURIComponent(d.ticket)}/${encodeURIComponent(screen)}`;
  setStatus(`${d.ticket} / ${screen}`);
}

function fillScreens() {
  const d = currentTicket();
  screenSel.innerHTML = "";
  if (!d) return;
  for (const s of d.screens) {
    const o = document.createElement("option");
    o.value = s;
    o.textContent = s.replace(/\.html$/i, "");
    screenSel.appendChild(o);
  }
  // Only show the screen selector when a prototype has more than one screen.
  screenWrap.hidden = d.screens.length <= 1;
}

function fillTickets(prev) {
  ticketSel.innerHTML = "";
  for (const d of designs) {
    const o = document.createElement("option");
    o.value = d.ticket;
    o.textContent = d.ticket;
    ticketSel.appendChild(o);
  }
  if (prev && designs.some((d) => d.ticket === prev)) ticketSel.value = prev;
}

async function load() {
  setStatus("loading…");
  const prevTicket = ticketSel.value;
  const prevScreen = screenSel.value;
  try {
    const res = await fetch("/api/designs", { cache: "no-store" });
    designs = await res.json();
  } catch (e) {
    setStatus("failed to load designs");
    return;
  }
  const has = designs.length > 0;
  empty.hidden = has;
  frame.hidden = !has;
  ticketSel.disabled = !has;
  if (!has) {
    setStatus("");
    screenWrap.hidden = true;
    return;
  }
  fillTickets(prevTicket);
  fillScreens();
  if (prevScreen && currentTicket()?.screens.includes(prevScreen)) screenSel.value = prevScreen;
  render();
}

ticketSel.addEventListener("change", () => { fillScreens(); render(); });
screenSel.addEventListener("change", render);
refreshBtn.addEventListener("click", load);

load();
