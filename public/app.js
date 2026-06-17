const state = {
  leads: [],
  stats: {},
  sources: [],
  activity: [],
  selectedId: "",
  status: "all",
  metricFilter: "all",
  search: "",
  source: "",
  priority: "all",
  activePanel: "results",
  currentUser: "",
  loading: false
};

const loginScreen = document.querySelector("#loginScreen");
const dashboard = document.querySelector("#dashboard");
const loginForm = document.querySelector("#loginForm");
const loginMessage = document.querySelector("#loginMessage");
const createAccountButton = document.querySelector("#createAccountButton");
const logoutButton = document.querySelector("#logoutButton");
const metrics = document.querySelector("#metrics");
const pipelineTrack = document.querySelector("#pipelineTrack");
const pipelineSignal = document.querySelector("#pipelineSignal");
const insightTitle = document.querySelector("#insightTitle");
const activityFeed = document.querySelector("#activityFeed");
const activityPanel = document.querySelector("#activityPanel");
const leadList = document.querySelector("#leadList");
const leadDetail = document.querySelector("#leadDetail");
const contentGrid = document.querySelector("#contentGrid");
const leadCount = document.querySelector("#leadCount");
const statusTabs = document.querySelector("#statusTabs");
const searchInput = document.querySelector("#searchInput");
const sourceFilter = document.querySelector("#sourceFilter");
const priorityFilter = document.querySelector("#priorityFilter");
const intakeForm = document.querySelector("#intakeForm");
const intakeMessage = document.querySelector("#intakeMessage");
const toast = document.querySelector("#toast");
const profileName = document.querySelector("#profileName");
const dashboardButton = document.querySelector("#dashboardButton");
const addLeadButton = document.querySelector("#addLeadButton");
const recentActivityButton = document.querySelector("#recentActivityButton");
const profileButton = document.querySelector("#profileButton");
const settingsButton = document.querySelector("#settingsButton");
const chatbotToggle = document.querySelector("#chatbotToggle");
const chatbotPanel = document.querySelector("#chatbotPanel");
const chatbotClose = document.querySelector("#chatbotClose");
const chatbotMessages = document.querySelector("#chatbotMessages");
const chatbotForm = document.querySelector("#chatbotForm");
const chatbotInput = document.querySelector("#chatbotInput");
const voiceButton = document.querySelector("#voiceButton");
const statusChart = document.querySelector("#statusChart");
const priorityChart = document.querySelector("#priorityChart");
const statusChartSummary = document.querySelector("#statusChartSummary");
const priorityChartSummary = document.querySelector("#priorityChartSummary");
const reminderList = document.querySelector("#reminderList");
const reminderSummary = document.querySelector("#reminderSummary");
const accountModal = document.querySelector("#accountModal");
const accountModalEyebrow = document.querySelector("#accountModalEyebrow");
const accountModalTitle = document.querySelector("#accountModalTitle");
const accountModalContent = document.querySelector("#accountModalContent");
const accountModalClose = document.querySelector("#accountModalClose");

const statusLabels = {
  new: "New",
  contacted: "Contacted",
  converted: "Converted"
};

const priorityLabels = {
  high: "High priority",
  medium: "Medium priority",
  low: "Low priority"
};

let toastTimer;
let filterTimer;
let loginLiquidFrame;
let liveRefreshTimer;
let refreshInFlight = false;
let recognition;
let voiceMode = false;
const chatHistory = [];

function initLoginLiquidBackground() {
  if (!loginScreen) return;

  const setLiquidPosition = (event) => {
    cancelAnimationFrame(loginLiquidFrame);
    loginLiquidFrame = requestAnimationFrame(() => {
      const rect = loginScreen.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const xPercent = Math.max(0, Math.min(100, (x / rect.width) * 100));
      const yPercent = Math.max(0, Math.min(100, (y / rect.height) * 100));
      const driftX = (xPercent - 50) * -0.42;
      const driftY = (yPercent - 50) * -0.28;

      loginScreen.style.setProperty("--cursor-x", `${xPercent}%`);
      loginScreen.style.setProperty("--cursor-y", `${yPercent}%`);
      loginScreen.style.setProperty("--liquid-x", `${driftX}px`);
      loginScreen.style.setProperty("--liquid-y", `${driftY}px`);
    });
  };

  loginScreen.addEventListener("pointermove", setLiquidPosition);
  loginScreen.addEventListener("pointerleave", () => {
    loginScreen.style.setProperty("--cursor-x", "50%");
    loginScreen.style.setProperty("--cursor-y", "50%");
    loginScreen.style.setProperty("--liquid-x", "0px");
    loginScreen.style.setProperty("--liquid-y", "0px");
  });
}

function formatDate(value) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatDateOnly(value) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value));
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

async function checkSession() {
  try {
    const session = await request("/api/me");
    state.currentUser = session.user.username;
    showDashboard();
    await loadLeads();
  } catch {
    showLogin();
  }
}

function showLogin() {
  stopLiveRefresh();
  loginScreen.classList.remove("hidden");
  dashboard.classList.add("hidden");
}

function showDashboard() {
  loginScreen.classList.add("hidden");
  dashboard.classList.remove("hidden");
  profileName.textContent = state.currentUser ? `${state.currentUser} online` : "User online";
  requestNotificationPermission();
  startLiveRefresh();
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

async function loadLeads(options = {}) {
  if (refreshInFlight) return;
  refreshInFlight = true;

  if (!options.silent) {
    state.loading = true;
    renderLeadList();
  }

  try {
    const params = new URLSearchParams({
      status: state.status,
      search: state.search,
      source: state.source,
      priority: state.priority
    });
    const [leadPayload, analyticsPayload] = await Promise.all([
      request(`/api/leads?${params}`),
      request("/api/analytics")
    ]);

    state.leads = leadPayload.leads;
    state.stats = analyticsPayload.stats;
    state.sources = leadPayload.sources;
    state.activity = analyticsPayload.recentActivity;
    state.loading = false;

    if (state.selectedId && !state.leads.some((lead) => lead.id === state.selectedId)) {
      state.selectedId = "";
    }

    render();
  } finally {
    refreshInFlight = false;
  }
}

function startLiveRefresh() {
  clearInterval(liveRefreshTimer);
  liveRefreshTimer = setInterval(() => {
    if (!dashboard.classList.contains("hidden") && document.visibilityState === "visible") {
      loadLeads({ silent: true }).catch(() => {});
    }
  }, 12000);
}

function stopLiveRefresh() {
  clearInterval(liveRefreshTimer);
}

function render() {
  renderMetrics();
  renderCharts();
  renderReminders();
  renderSourceFilter();
  renderInsightPanel();
  renderActivity();
  renderLeadList();
  renderLeadDetail();
  notifyDueLeads();
}

function renderMetrics() {
  const items = [
    ["all", "Total leads", state.stats.total || 0],
    ["new", "New", state.stats.new || 0],
    ["contacted", "Contacted", state.stats.contacted || 0],
    ["converted", "Converted", state.stats.converted || 0],
    ["due", "Due today", state.stats.followUpsDue || 0],
    ["high", "High priority", state.stats.highPriority || 0]
  ];

  metrics.innerHTML = items
    .map(
      ([filter, label, value]) => `
        <button class="metric ${state.metricFilter === filter ? "active" : ""}" data-metric="${filter}" type="button">
          <span>${label}</span>
          <strong>${value}</strong>
        </button>
      `
    )
    .join("");
}

function renderSourceFilter() {
  const current = sourceFilter.value;
  sourceFilter.innerHTML = `<option value="">All sources</option>${state.sources
    .map((source) => `<option value="${escapeHtml(source)}">${escapeHtml(source)}</option>`)
    .join("")}`;
  sourceFilter.value = state.sources.includes(current) ? current : state.source;
}

function visibleLeads() {
  if (state.metricFilter === "due") {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return state.leads.filter((lead) => lead.nextFollowUp && lead.status !== "converted" && new Date(lead.nextFollowUp) <= today);
  }

  if (state.metricFilter === "high") {
    return state.leads.filter((lead) => lead.priority === "high");
  }

  return state.leads;
}

function chartColor(index) {
  return ["#00f5ff", "#ffe600", "#00ff85", "#bc13fe", "#ff2d75"][index % 5];
}

function drawPieChart(canvas, items) {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const centerX = 82;
  const centerY = height / 2;
  const radius = 58;

  if (!total) {
    context.fillStyle = "#8b98aa";
    context.font = "800 14px Inter, sans-serif";
    context.fillText("No lead data yet", 34, centerY);
    return;
  }

  let start = -Math.PI / 2;
  items.forEach((item, index) => {
    const slice = (item.value / total) * Math.PI * 2;
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.arc(centerX, centerY, radius, start, start + slice);
    context.closePath();
    context.fillStyle = chartColor(index);
    context.fill();
    start += slice;
  });

  items.forEach((item, index) => {
    const y = 48 + index * 30;
    context.fillStyle = chartColor(index);
    context.fillRect(170, y - 10, 12, 12);
    context.fillStyle = "#f8fbff";
    context.font = "800 12px Inter, sans-serif";
    context.fillText(`${item.label}: ${item.value}`, 190, y);
  });
}

function drawBarChart(canvas, items) {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);
  const max = Math.max(1, ...items.map((item) => item.value));

  items.forEach((item, index) => {
    const y = 30 + index * 46;
    const barWidth = Math.round((item.value / max) * (width - 150));
    context.fillStyle = "#8b98aa";
    context.font = "800 12px Inter, sans-serif";
    context.fillText(item.label, 14, y + 10);
    context.fillStyle = "rgba(255, 255, 255, 0.08)";
    context.fillRect(104, y - 8, width - 130, 18);
    context.fillStyle = chartColor(index);
    context.fillRect(104, y - 8, barWidth, 18);
    context.fillStyle = "#f8fbff";
    context.fillText(String(item.value), 112 + barWidth, y + 7);
  });
}

function dueTomorrowLeads() {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return state.leads.filter((lead) => {
    if (!lead.nextFollowUp || lead.status === "converted") return false;
    const due = new Date(lead.nextFollowUp);
    return due >= start && due <= end;
  });
}

function isDueTomorrow(lead) {
  return dueTomorrowLeads().some((item) => item.id === lead.id);
}

function reminderLeads() {
  return state.leads
    .filter((lead) => lead.nextFollowUp && lead.status !== "converted")
    .sort((a, b) => {
      const tomorrowDelta = Number(isDueTomorrow(b)) - Number(isDueTomorrow(a));
      if (tomorrowDelta) return tomorrowDelta;
      return new Date(a.nextFollowUp) - new Date(b.nextFollowUp);
    });
}

function renderCharts() {
  const statusItems = [
    { label: "New", value: state.stats.new || 0 },
    { label: "Contacted", value: state.stats.contacted || 0 },
    { label: "Converted", value: state.stats.converted || 0 }
  ];
  const priorityItems = [
    { label: "High", value: state.leads.filter((lead) => lead.priority === "high").length },
    { label: "Medium", value: state.leads.filter((lead) => lead.priority === "medium").length },
    { label: "Low", value: state.leads.filter((lead) => lead.priority === "low").length }
  ];

  drawPieChart(statusChart, statusItems);
  drawBarChart(priorityChart, priorityItems);
  if (statusChartSummary) statusChartSummary.textContent = `${state.stats.total || 0} total`;
  if (priorityChartSummary) priorityChartSummary.textContent = `${state.leads.filter((lead) => lead.priority === "high").length} high priority`;
}

function renderReminders() {
  const reminders = reminderLeads();
  const dueTomorrowCount = reminders.filter(isDueTomorrow).length;
  if (!reminderList || !reminderSummary) return;
  reminderSummary.textContent = dueTomorrowCount ? `${dueTomorrowCount} due tomorrow` : "Clear";

  if (!reminders.length) {
    reminderList.innerHTML = `<p class="muted">No scheduled follow-ups.</p>`;
    return;
  }

  reminderList.innerHTML = reminders
    .map(
      (lead) => `
        <article class="reminder-item ${isDueTomorrow(lead) ? "due-tomorrow" : ""}">
          <strong>${escapeHtml(lead.name)}</strong>
          <span>${escapeHtml(lead.company || lead.email)} - due ${formatDateOnly(lead.nextFollowUp)}</span>
        </article>
      `
    )
    .join("");
}

function requestNotificationPermission() {
  if (!("Notification" in window) || Notification.permission !== "default") return;
  Notification.requestPermission().catch(() => {});
}

function notifyDueLeads() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const todayKey = new Date().toISOString().slice(0, 10);
  dueTomorrowLeads().forEach((lead) => {
    const key = `leadit-reminder-${todayKey}-${lead.id}`;
    if (localStorage.getItem(key)) return;
    new Notification("Lead follow-up due tomorrow", {
      body: `${lead.name} is due on ${formatDateOnly(lead.nextFollowUp)}.`,
      tag: key
    });
    localStorage.setItem(key, "shown");
  });
}

function renderInsightPanel() {
  const leads = visibleLeads();
  const searchLabel = state.search ? `Search: "${state.search}"` : filterLabel();
  const panelTitles = {
    recent: "Recent Activity",
    profile: "Profile",
    settings: "Settings"
  };
  insightTitle.textContent = panelTitles[state.activePanel] || "Lead Results";
  pipelineSignal.textContent = state.activePanel === "recent" ? "Latest 6" : `${leads.length} matching ${leads.length === 1 ? "lead" : "leads"}`;
  activityPanel.classList.toggle("hidden", state.activePanel !== "recent");
  pipelineTrack.closest(".lead-insight-panel").classList.toggle("hidden", state.activePanel === "recent");

  if (state.activePanel === "recent") return;

  if (state.activePanel === "profile") {
    pipelineSignal.textContent = "Account details";
    pipelineTrack.innerHTML = `
      <article class="account-panel">
        <strong>${escapeHtml(state.currentUser || "Current user")}</strong>
        <p>Signed in to leadIT with a secure session. This account can view leads, update statuses, add notes, and manage follow-ups.</p>
      </article>
    `;
    return;
  }

  if (state.activePanel === "settings") {
    pipelineSignal.textContent = "Workspace controls";
    pipelineTrack.innerHTML = `
      <article class="account-panel">
        <strong>CRM Settings</strong>
        <p>Lead data is stored in the local CRM database. User passwords are stored as salted hashes, and active sessions use HTTP-only cookies.</p>
      </article>
    `;
    return;
  }

  if (!leads.length) {
    pipelineTrack.innerHTML = `<div class="empty-state"><h3>No matching leads</h3><p class="muted">${escapeHtml(searchLabel)} has no records.</p></div>`;
    return;
  }

  pipelineTrack.innerHTML = leads
    .slice(0, 4)
    .map(
      (lead) => `
        <article class="lead-summary" data-id="${lead.id}">
          <div>
            <strong>${escapeHtml(lead.name)}</strong>
            <p>${escapeHtml(lead.company || "No company")} - ${escapeHtml(lead.email)}</p>
          </div>
          <div>
            <span class="badge ${lead.status}">${statusLabels[lead.status]}</span>
            <span class="chip priority-${lead.priority}">${priorityLabels[lead.priority]}</span>
            <span class="chip">${escapeHtml(lead.source)}</span>
            <span class="chip">Next: ${formatDateOnly(lead.nextFollowUp)}</span>
          </div>
          <p>${escapeHtml(lead.message)}</p>
        </article>
      `
    )
    .join("");
}

function filterLabel() {
  const labels = {
    all: "All leads",
    new: "New leads",
    contacted: "Contacted leads",
    converted: "Converted leads",
    due: "Due today",
    high: "High priority"
  };
  return labels[state.metricFilter] || "Lead results";
}

function renderActivity() {
  if (!state.activity.length) {
    activityFeed.innerHTML = `<p class="muted">No activity yet.</p>`;
    return;
  }

  activityFeed.innerHTML = state.activity
    .map(
      (item) => `
        <article class="activity-item">
          <div>
            <p>${escapeHtml(item.label)}</p>
            <time>${formatDate(item.createdAt)}</time>
          </div>
        </article>
      `
    )
    .join("");
}

function renderLeadList() {
  if (state.loading) {
    leadList.innerHTML = `<div class="empty-state"><h3>Loading leads</h3><p class="muted">Refreshing pipeline data...</p></div>`;
    return;
  }

  const leads = visibleLeads();
  leadCount.textContent = `${leads.length} ${leads.length === 1 ? "record" : "records"}`;

  if (!leads.length) {
    leadList.innerHTML = `<div class="empty-state"><h3>No leads found</h3><p class="muted">Try a different search, priority, or status filter.</p></div>`;
    return;
  }

  leadList.innerHTML = leads
    .map(
      (lead) => `
        <button class="lead-card ${lead.id === state.selectedId ? "selected" : ""}" data-id="${lead.id}" type="button">
          <div>
            <h4>${escapeHtml(lead.name)}</h4>
            <div class="lead-meta">
              <span>${escapeHtml(lead.email)}</span>
              <span>${escapeHtml(lead.source)}</span>
              <span>Updated ${formatDate(lead.updatedAt)}</span>
            </div>
            <div class="lead-actions">
              <span class="chip priority-${lead.priority}">${priorityLabels[lead.priority]}</span>
              <span class="chip">Next: ${formatDateOnly(lead.nextFollowUp)}</span>
            </div>
          </div>
          <span class="badge ${lead.status}">${statusLabels[lead.status]}</span>
        </button>
      `
    )
    .join("");
}

function renderLeadDetail() {
  const lead = state.leads.find((item) => item.id === state.selectedId);
  if (!lead) {
    leadDetail.classList.add("hidden");
    contentGrid.classList.add("single-column");
    leadDetail.innerHTML = "";
    return;
  }

  leadDetail.classList.remove("hidden");
  contentGrid.classList.remove("single-column");

  leadDetail.innerHTML = `
    <div class="detail-header">
      <div>
        <p class="eyebrow">${escapeHtml(lead.source)}</p>
        <h3>${escapeHtml(lead.name)}</h3>
        <p class="muted">${escapeHtml(lead.company || "No company listed")}</p>
      </div>
      <span class="badge ${lead.status}">${statusLabels[lead.status]}</span>
    </div>

    <div class="detail-grid">
      <div><strong>Email:</strong> ${escapeHtml(lead.email)}</div>
      <div><strong>Phone:</strong> ${escapeHtml(lead.phone || "Not provided")}</div>
      <div><strong>Priority:</strong> ${priorityLabels[lead.priority]}</div>
      <div><strong>Next follow-up:</strong> ${formatDateOnly(lead.nextFollowUp)}</div>
      <div><strong>Created:</strong> ${formatDate(lead.createdAt)}</div>
      <div><strong>Need:</strong> ${escapeHtml(lead.message)}</div>
    </div>

    <div class="detail-actions">
      <label>
        Status
        <select id="detailStatus">
          <option value="new" ${lead.status === "new" ? "selected" : ""}>New</option>
          <option value="contacted" ${lead.status === "contacted" ? "selected" : ""}>Contacted</option>
          <option value="converted" ${lead.status === "converted" ? "selected" : ""}>Converted</option>
        </select>
      </label>
      <button class="danger" id="deleteLeadButton" type="button">Delete lead</button>
    </div>

    <form class="edit-form" id="editLeadForm">
      <input name="name" value="${escapeAttr(lead.name)}" placeholder="Name" required />
      <input name="email" type="email" value="${escapeAttr(lead.email)}" placeholder="Email" required />
      <input name="phone" value="${escapeAttr(lead.phone)}" placeholder="Phone" />
      <input name="company" value="${escapeAttr(lead.company)}" placeholder="Company" />
      <select name="priority">
        <option value="high" ${lead.priority === "high" ? "selected" : ""}>High priority</option>
        <option value="medium" ${lead.priority === "medium" ? "selected" : ""}>Medium priority</option>
        <option value="low" ${lead.priority === "low" ? "selected" : ""}>Low priority</option>
      </select>
      <input name="nextFollowUp" type="date" value="${escapeAttr(lead.nextFollowUp)}" />
      <textarea name="message" required>${escapeHtml(lead.message)}</textarea>
      <button type="submit">Save lead details</button>
    </form>

    <form class="note-form" id="noteForm">
      <label>
        Follow-up note
        <textarea name="text" placeholder="Add call outcome, next step, proposal status..." required></textarea>
      </label>
      <button type="submit">Save note</button>
    </form>

    <div class="notes">
      ${lead.notes.length ? lead.notes.map(renderNote).join("") : `<p class="muted">No follow-up notes yet.</p>`}
    </div>
  `;
}

function renderNote(note) {
  return `
    <article class="note">
      <p>${escapeHtml(note.text)}</p>
      <time>${formatDate(note.createdAt)}</time>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("\n", " ");
}

function queueFilterLoad() {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(() => {
    loadLeads().catch((error) => showToast(error.message));
  }, 180);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "";
  const formData = new FormData(loginForm);

  try {
    await request("/api/login", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(formData))
    });
    const session = await request("/api/me");
    state.currentUser = session.user.username;
    showDashboard();
    showToast("Welcome back. Pipeline loaded.");
    await loadLeads();
  } catch (error) {
    loginMessage.textContent = error.message;
  }
});

createAccountButton.addEventListener("click", async () => {
  loginMessage.textContent = "";
  const formData = new FormData(loginForm);
  const email = String(formData.get("email") || "").trim();

  if (!email) {
    loginMessage.textContent = "Enter an email address before creating an account.";
    return;
  }

  try {
    await request("/api/register", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(formData))
    });
    const session = await request("/api/me");
    state.currentUser = session.user.username;
    showDashboard();
    showToast("Account created. Pipeline loaded.");
    await loadLeads();
  } catch (error) {
    loginMessage.textContent = error.message;
  }
});

window.addEventListener("focus", () => {
  if (!dashboard.classList.contains("hidden")) {
    loadLeads({ silent: true }).catch(() => {});
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !dashboard.classList.contains("hidden")) {
    loadLeads({ silent: true }).catch(() => {});
  }
});

logoutButton.addEventListener("click", async () => {
  await request("/api/logout", { method: "POST" });
  state.selectedId = "";
  state.currentUser = "";
  showLogin();
});

if (statusTabs) {
  statusTabs.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-status]");
    if (!button) return;
    state.status = button.dataset.status;
    state.metricFilter = button.dataset.status;
    statusTabs.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
    await loadLeads();
  });
}

metrics.addEventListener("click", async (event) => {
  const card = event.target.closest("[data-metric]");
  if (!card) return;

  state.metricFilter = card.dataset.metric;
  state.status = ["new", "contacted", "converted"].includes(state.metricFilter) ? state.metricFilter : "all";
  state.activePanel = "results";
  await loadLeads();
});

document.querySelector("#filterForm").addEventListener("input", () => {
  state.search = searchInput.value.trim();
  state.source = sourceFilter.value;
  state.priority = priorityFilter.value;
  state.activePanel = "results";
  state.metricFilter = state.status === "all" ? "all" : state.status;
  queueFilterLoad();
});

document.querySelector("#filterForm").addEventListener("submit", (event) => {
  event.preventDefault();
  state.search = searchInput.value.trim();
  state.source = sourceFilter.value;
  state.priority = priorityFilter.value;
  state.activePanel = "results";
  loadLeads().catch((error) => showToast(error.message));
});

leadList.addEventListener("click", (event) => {
  const card = event.target.closest(".lead-card");
  if (!card) return;
  state.selectedId = card.dataset.id;
  render();
});

pipelineTrack.addEventListener("click", (event) => {
  const summary = event.target.closest(".lead-summary");
  if (!summary) return;
  state.selectedId = summary.dataset.id;
  render();
  leadDetail.scrollIntoView({ behavior: "smooth", block: "start" });
});

leadDetail.addEventListener("change", async (event) => {
  if (event.target.id !== "detailStatus") return;
  await request(`/api/leads/${state.selectedId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: event.target.value })
  });
  showToast("Lead status updated.");
  await loadLeads();
});

leadDetail.addEventListener("click", async (event) => {
  if (event.target.id !== "deleteLeadButton") return;
  const lead = state.leads.find((item) => item.id === state.selectedId);
  if (!lead || !confirm(`Delete ${lead.name}? This removes the lead from the local CRM database.`)) return;

  await request(`/api/leads/${state.selectedId}`, { method: "DELETE" });
  state.selectedId = "";
  showToast("Lead deleted.");
  await loadLeads();
});

leadDetail.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (event.target.id === "editLeadForm") {
    const formData = new FormData(event.target);
    await request(`/api/leads/${state.selectedId}`, {
      method: "PATCH",
      body: JSON.stringify(Object.fromEntries(formData))
    });
    showToast("Lead details saved.");
    await loadLeads();
    return;
  }

  if (event.target.id === "noteForm") {
    const formData = new FormData(event.target);
    await request(`/api/leads/${state.selectedId}/notes`, {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(formData))
    });
    event.target.reset();
    showToast("Follow-up note added.");
    await loadLeads();
  }
});

intakeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  intakeMessage.textContent = "";
  const formData = new FormData(intakeForm);

  try {
    const payload = Object.fromEntries(formData);
    const created = await request("/api/public/leads", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    intakeMessage.style.color = "var(--mint)";
    intakeMessage.textContent = `${created.lead.name} was added as a new lead.`;
    intakeForm.reset();
    state.selectedId = created.lead.id;
    showToast("New website lead captured.");
    await loadLeads();
  } catch (error) {
    intakeMessage.style.color = "var(--danger)";
    intakeMessage.textContent = error.message;
  }
});

dashboardButton.addEventListener("click", () => {
  state.activePanel = "results";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

addLeadButton.addEventListener("click", () => {
  document.querySelector(".intake-band").scrollIntoView({ behavior: "smooth", block: "start" });
});

recentActivityButton.addEventListener("click", () => {
  state.activePanel = "recent";
  render();
  activityPanel.scrollIntoView({ behavior: "smooth", block: "start" });
});

profileButton.addEventListener("click", () => {
  openAccountModal("profile");
});

settingsButton.addEventListener("click", () => {
  openAccountModal("settings");
});

accountModalClose.addEventListener("click", closeAccountModal);

accountModal.addEventListener("click", (event) => {
  if (event.target === accountModal) closeAccountModal();
});

function openAccountModal(type) {
  const username = escapeHtml(state.currentUser || "Current user");
  accountModal.classList.remove("hidden");
  accountModal.setAttribute("aria-hidden", "false");

  if (type === "profile") {
    accountModalEyebrow.textContent = "User Profile";
    accountModalTitle.textContent = "Profile";
    accountModalContent.innerHTML = `
      <div class="settings-list">
        <div class="settings-row">
          <span>Username</span>
          <strong>${username}</strong>
        </div>
        <div class="settings-row">
          <span>Account status</span>
          <strong>Active</strong>
        </div>
        <div class="settings-row">
          <span>Session</span>
          <strong>Signed in</strong>
        </div>
        <div class="settings-row">
          <span>Access level</span>
          <strong>Lead manager</strong>
        </div>
      </div>
    `;
    return;
  }

  accountModalEyebrow.textContent = "Preferences";
  accountModalTitle.textContent = "Settings";
  accountModalContent.innerHTML = `
    <div class="settings-list">
      <label class="settings-row">
        <span>Mode</span>
        <select>
          <option selected>Dark neon</option>
          <option>Classic dark</option>
          <option>Focus mode</option>
        </select>
      </label>
      <label class="settings-row">
        <span>User authorization</span>
        <select>
          <option selected>Lead manager</option>
          <option>Viewer</option>
          <option>Owner</option>
        </select>
      </label>
      <label class="settings-row">
        <span>Language</span>
        <select>
          <option selected>English</option>
          <option>Hindi</option>
          <option>Kannada</option>
        </select>
      </label>
      <label class="settings-row">
        <span>Notifications</span>
        <select>
          <option selected>Follow-ups and conversions</option>
          <option>Follow-ups only</option>
          <option>Off</option>
        </select>
      </label>
      <label class="settings-row">
        <span>Session timeout</span>
        <select>
          <option selected>8 hours</option>
          <option>4 hours</option>
          <option>1 hour</option>
        </select>
      </label>
      <label class="settings-row">
        <span>Privacy</span>
        <select>
          <option selected>Secure session cookies</option>
          <option>Ask before logout</option>
        </select>
      </label>
    </div>
  `;
}

function closeAccountModal() {
  accountModal.classList.add("hidden");
  accountModal.setAttribute("aria-hidden", "true");
}

chatbotToggle.addEventListener("click", () => {
  chatbotPanel.classList.toggle("hidden");
  chatbotInput.focus();
});

chatbotClose.addEventListener("click", () => {
  chatbotPanel.classList.add("hidden");
});

chatbotForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = chatbotInput.value.trim();
  if (!question) return;
  await sendChatMessage(question, { speak: voiceMode });
});

if (voiceButton) {
  voiceButton.addEventListener("click", () => {
    startVoiceInput();
  });
}

async function sendChatMessage(question, options = {}) {
  addChatMessage(question, "user");
  chatbotInput.value = "";
  chatHistory.push({ role: "user", content: question });
  const thinking = addChatMessage("Thinking...", "bot");

  try {
    const payload = await request("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message: question, history: chatHistory.slice(-8) })
    });
    thinking.textContent = payload.reply;
    chatHistory.push({ role: "assistant", content: payload.reply });
    if (options.speak) speakReply(payload.reply);
  } catch (error) {
    const fallback = answerCrmQuestion(question);
    thinking.textContent = fallback;
    if (options.speak) speakReply(fallback);
  } finally {
    voiceMode = false;
  }
}

function addChatMessage(message, type) {
  const bubble = document.createElement("div");
  bubble.className = `chat-message ${type}`;
  bubble.textContent = message;
  chatbotMessages.appendChild(bubble);
  chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
  return bubble;
}

function startVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast("Voice input is not supported in this browser.");
    return;
  }

  if (!recognition) {
    recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.addEventListener("result", async (event) => {
      const transcript = event.results[0][0].transcript;
      voiceMode = true;
      chatbotInput.value = transcript;
      await sendChatMessage(transcript, { speak: true });
    });

    recognition.addEventListener("end", () => {
      voiceButton.classList.remove("listening");
      voiceButton.textContent = "Voice";
    });

    recognition.addEventListener("error", () => {
      voiceButton.classList.remove("listening");
      voiceButton.textContent = "Voice";
      showToast("Could not capture voice. Try again.");
    });
  }

  voiceButton.classList.add("listening");
  voiceButton.textContent = "Listen";
  recognition.start();
}

function speakReply(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-IN";
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
}

function dueLeads() {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  return state.leads
    .filter((lead) => lead.nextFollowUp && lead.status !== "converted" && new Date(lead.nextFollowUp) <= now)
    .sort((a, b) => new Date(a.nextFollowUp) - new Date(b.nextFollowUp));
}

function leadLine(lead) {
  return `${lead.name}${lead.company ? ` from ${lead.company}` : ""} (${priorityLabels[lead.priority]}, ${statusLabels[lead.status]}, due ${formatDateOnly(lead.nextFollowUp)})`;
}

function answerCrmQuestion(question) {
  const text = question.toLowerCase();
  const asksWhoToContact = text.includes("contact") || text.includes("follow") || text.includes("reach");
  const asksTiming = text.includes("now") || text.includes("today") || text.includes("due");
  const asksBest = text.includes("better") || text.includes("best") || text.includes("first") || text.includes("priority");
  if (text.includes("how many") && text.includes("lead")) {
    const due = dueLeads();
    const urgent = due.slice(0, 3).map(leadLine);
    return `You have ${state.stats.total || state.leads.length} leads. ${due.length ? `${due.length} need contact now: ${urgent.join("; ")}.` : "No leads are due for contact right now."}`;
  }
  if (asksWhoToContact && (asksTiming || asksBest)) {
    const due = dueLeads();
    const openLeads = state.leads
      .filter((lead) => lead.status !== "converted")
      .sort((a, b) => {
        const priorityRank = { high: 0, medium: 1, low: 2 };
        const priorityDelta = priorityRank[a.priority] - priorityRank[b.priority];
        if (priorityDelta) return priorityDelta;
        return new Date(a.nextFollowUp || "9999-12-31") - new Date(b.nextFollowUp || "9999-12-31");
      });
    const picks = due.length ? due : openLeads;
    if (!picks.length) return "You do not have any open leads to contact right now.";
    const reason = due.length ? "They are due now" : "They are the strongest open priorities";
    return `Contact these first: ${picks.slice(0, 5).map(leadLine).join("; ")}. ${reason}.`;
  }
  if (text.includes("high") && text.includes("priority")) {
    const highPriority = state.leads.filter((lead) => lead.priority === "high" && lead.status !== "converted");
    if (!highPriority.length) return "You do not have any open high-priority leads right now.";
    return `Open high-priority leads: ${highPriority.slice(0, 5).map(leadLine).join("; ")}.`;
  }
  if (text.includes("lead") && (text.includes("add") || text.includes("create"))) {
    return "Use the Add Lead button on the left, then fill name, email, source, priority, follow-up date, and message. The lead will appear in the dashboard immediately.";
  }
  if (text.includes("status") || text.includes("new") || text.includes("contacted") || text.includes("converted")) {
    return "Open a lead from the list, then change its status to New, Contacted, or Converted in the lead detail panel.";
  }
  if (text.includes("note") || text.includes("follow")) {
    return "Select a lead and use the Follow-up note box. Notes help track calls, proposals, reminders, and next steps.";
  }
  if (text.includes("search") || text.includes("filter")) {
    return "Use the search bar at the top to find leads by name, email, company, source, phone, or message. The metric cards also filter leads by status, due date, and priority.";
  }
  if (text.includes("login") || text.includes("account") || text.includes("password")) {
    return "Create an account from the login page, then sign in with that username and password. Passwords are stored as salted hashes in the local database.";
  }
  if (text.includes("why") || text.includes("use")) {
    return "This CRM is used to manage client enquiries, track follow-ups, prioritize serious leads, and convert interested people into clients.";
  }
  return "I can help with this CRM's leads, statuses, notes, follow-ups, search, filters, login, and dashboard. Ask me about any feature you see here.";
}

initLoginLiquidBackground();
checkSession();
