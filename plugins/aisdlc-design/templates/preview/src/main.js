// Preview app: pick a design ticket (and screen), render its prototype in a sandboxed iframe.
// The prototype list comes from the dev-server middleware (/api/designs), scanned at request time.
const ticketSel = document.getElementById("ticket");
const screenSel = document.getElementById("screen");
const screenWrap = document.getElementById("screen-wrap");
const stage = document.getElementById("stage");
const frame = document.getElementById("frame");
const empty = document.getElementById("empty");
const statusEl = document.getElementById("status");
const refreshBtn = document.getElementById("refresh");
const progressEl = document.getElementById("progress");
const stagesEl = document.getElementById("stages");
const badgeEl = document.getElementById("state-badge");
const nextEl = document.getElementById("next");
const nextTextEl = document.getElementById("next-text");
const stateNoteEl = document.getElementById("state-note");

let designs = [];

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function currentTicket() {
  return designs.find((d) => d.ticket === ticketSel.value) || null;
}

// Grow the iframe to its content height (same-origin) so the stage scrolls for tall prototypes.
// Falls back silently to the fixed 100% height if the content is not reachable.
function fitFrameHeight() {
  try {
    const doc = frame.contentDocument;
    if (!doc || !doc.body) { frame.classList.remove("tall"); return; }
    const h = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
    if (h > frame.clientHeight) {
      frame.classList.add("tall");
      frame.style.height = h + "px";
    } else {
      frame.classList.remove("tall");
      frame.style.height = "";
    }
  } catch {
    frame.classList.remove("tall");
    frame.style.height = "";
  }
}

function render() {
  const d = currentTicket();
  if (!d) {
    frame.removeAttribute("src");
    return;
  }
  const screen = screenSel.value || d.screens[0];
  // Reset height before loading so a short screen after a tall one doesn't keep the old height.
  frame.classList.remove("tall");
  frame.style.height = "";
  frame.src = `/prototype/${encodeURIComponent(d.ticket)}/${encodeURIComponent(screen)}`;
  setStatus(`${d.ticket} / ${screen}`);
  loadTicketState(d.ticket);
}

// Fetch and render the ticket's lifecycle state in the sidebar.
async function loadTicketState(ticket) {
  let s;
  try {
    const res = await fetch(`/api/status/${encodeURIComponent(ticket)}`, { cache: "no-store" });
    s = await res.json();
  } catch {
    renderState(null);
    return;
  }
  renderState(s);
}

function renderState(s) {
  stagesEl.innerHTML = "";
  badgeEl.className = "badge";
  badgeEl.textContent = "";
  nextEl.hidden = true;
  stateNoteEl.hidden = true;

  if (!s || !s.ok) {
    // No task for this ticket: show just the badge reason, hide the stepper row's steps/next.
    progressEl.classList.remove("hidden");
    badgeEl.textContent = s && s.error ? s.error : "no task";
    return;
  }
  progressEl.classList.remove("hidden");

  // The state the lifecycle is effectively at: a failure state resumes at resumeState for highlighting.
  const effective = s.failure && s.resumeState ? s.resumeState : s.status;
  const curIdx = s.states.indexOf(effective);

  // Badge: current status, colored for failure / completion.
  badgeEl.textContent = s.status;
  if (s.failure) badgeEl.classList.add("failure");
  else if (s.status === "COMPLETED") badgeEl.classList.add("done");

  // Vertical stepper: each stage is a node (dot + human-readable label) with a connector between nodes.
  // done = green (passed), current = accent (where the ticket is), upcoming = grey (not reached yet).
  s.states.forEach((state, i) => {
    const li = document.createElement("li");
    const phase = i < curIdx ? "done" : i === curIdx ? "current" : "upcoming";
    li.className = `step ${phase}`;

    const dot = document.createElement("span");
    dot.className = "step-dot";
    dot.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "step-label";
    label.textContent = humanizeState(state);

    li.appendChild(dot);
    li.appendChild(label);
    stagesEl.appendChild(li);
  });

  // Next step.
  if (s.next) {
    nextTextEl.innerHTML = `<span class="who">${s.next.who}:</span> ${escapeHtml(s.next.text)}`;
    nextEl.hidden = false;
  }

  // Failure note (reason / where it left off).
  if (s.failure) {
    const bits = [];
    if (s.status) bits.push(`In ${s.status}.`);
    if (s.reason) bits.push(s.reason);
    if (s.resumeState) bits.push(`(left ${s.resumeState})`);
    stateNoteEl.textContent = bits.join(" ");
    stateNoteEl.hidden = bits.length === 0;
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// DESIGN_DRAFTED -> "Design Drafted" (keeps the UI label in sync with the state machine, no config duplication).
function humanizeState(state) {
  return String(state)
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Re-fit whenever a prototype finishes loading, and on window resize.
frame.addEventListener("load", fitFrameHeight);
window.addEventListener("resize", fitFrameHeight);

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
  let info = {};
  try {
    const res = await fetch("/api/designs", { cache: "no-store" });
    info = await res.json();
    // Accept both the current { designs, ... } shape and a bare array (older server).
    designs = Array.isArray(info) ? info : info.designs || [];
  } catch (e) {
    setStatus("failed to load designs");
    return;
  }
  const has = designs.length > 0;
  // Stage and empty are mutually exclusive: never overlay the message on a rendered prototype.
  stage.hidden = !has;
  empty.hidden = has;
  ticketSel.disabled = !has;
  if (!has) {
    setStatus("");
    screenWrap.hidden = true;
    frame.removeAttribute("src");
    // No designs at all: hide the whole progress row.
    stagesEl.innerHTML = "";
    badgeEl.className = "badge";
    badgeEl.textContent = "";
    nextEl.hidden = true;
    stateNoteEl.hidden = true;
    progressEl.classList.add("hidden");
    // Show what the server actually scanned, so a misplaced prototype is easy to spot.
    if (!Array.isArray(info) && info.designsDir) {
      const found = (info.entries || []).length
        ? `Folders in designs/: ${info.entries.join(", ")}. A ticket needs an .html file in designs/<TICKET>/prototype/ (or designs/<TICKET>/).`
        : `No ticket folders found in ${info.designsDir}.`;
      empty.innerHTML =
        "<p>No prototypes detected. Author one with <code>/aisdlc-design:codify &lt;DESIGN-TICKET&gt;</code>, then Refresh.<br><small>" +
        found +
        "</small></p>";
    }
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
