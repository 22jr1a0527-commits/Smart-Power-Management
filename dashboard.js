/* ─────────────────────────────────────────────
   DISCOM AI Dashboard — Frontend Logic
   ───────────────────────────────────────────── */

// ── Live Clock ──
function updateClock() {
  document.getElementById('clock').textContent =
    new Date().toLocaleTimeString('en-IN', { hour12: false });
}
setInterval(updateClock, 1000);
updateClock();

// ── Tab Switching ──
function switchTab(tabId, evt) {
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const tabEl = document.getElementById('tab-' + tabId);
  if (tabEl) tabEl.classList.add('active');
  if (evt && evt.currentTarget) evt.currentTarget.classList.add('active');
}

// ── Chart.js Defaults ──
Chart.defaults.color = '#8a9abf';
Chart.defaults.font.family = "'Space Mono', monospace";
Chart.defaults.font.size = 10;

const COLORS = {
  yellow: '#f4c542',
  cyan:   '#22d3ee',
  green:  '#34d399',
  red:    '#f87171',
  blue:   '#60a5fa',
  purple: '#a78bfa',
  orange: '#fb923c',
};

// Global chart instances
let overviewChart, forecastChart, futureChart, residualChart, anomalyChart, anomalyPie, feederBarChart;

// ── Utility: thin out labels ──
function thinLabels(labels, count = 12) {
  const step = Math.max(1, Math.floor(labels.length / count));
  return labels.map((l, i) => (i % step === 0) ? l.slice(11, 16) : '');
}

let HIERARCHY = null;
let selectedLocation = null; // { companyId, zoneId, feederId, dtId, label }

// ── Load locations and show login modal
async function loadLocationsAndInit() {
  const res = await fetch('/api/locations', { credentials: 'same-origin' });
  HIERARCHY = await res.json();
  populateCompanies();
}

function populateCompanies() {
  const sel = document.getElementById('sel-company');
  sel.innerHTML = '<option value="">Select Company</option>' + HIERARCHY.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
}

function clearSelect(id) { document.getElementById(id).innerHTML = '<option value="">—</option>'; }

function findNode(list, id) { return list.find(x=>x.id===id); }

// ── Login & Session Management ──
async function checkUserSession() {
  const res = await fetch('/api/user-status', { credentials: 'same-origin' });
  const data = await res.json();
  return data.success ? data : null;
}

// ── Signup support ──
function showSignup() {
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('signup-form').style.display = 'flex';
  document.getElementById('login-error').style.display = 'none';
}
function showLogin() {
  document.getElementById('login-form').style.display = 'flex';
  document.getElementById('signup-form').style.display = 'none';
  document.getElementById('signup-error').style.display = 'none';
}

async function handleSignupSubmit() {
  const username = document.getElementById('signup-username').value.trim();
  const password = document.getElementById('signup-password').value.trim();
  const name = document.getElementById('signup-name').value.trim();
  const errorDiv = document.getElementById('signup-error');

  if (!username || !password || !name) {
    errorDiv.textContent = '⚠️ All fields are required';
    errorDiv.style.display = 'block';
    return;
  }

  try {
    const res = await fetch('/api/signup', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, name })
    });
    const data = await res.json();
    if (data.success) {
      // registration succeeded, switch to login with message
      showLogin();
      const loginErr = document.getElementById('login-error');
      loginErr.textContent = '✅ Account created successfully, please login';
      loginErr.style.background = 'rgba(52,211,153,0.15)';
      loginErr.style.border = '1px solid rgba(52,211,153,0.4)';
      loginErr.style.color = 'var(--accent-green)';
      loginErr.style.display = 'block';
    } else {
      errorDiv.textContent = '❌ ' + (data.error || 'Signup failed');
      errorDiv.style.display = 'block';
    }
  } catch (err) {
    errorDiv.textContent = '❌ Connection error: ' + err.message;
    errorDiv.style.display = 'block';
  }
}

async function handleLoginSubmit() {
  const username = document.getElementById('username-input').value.trim();
  const password = document.getElementById('password-input').value.trim();
  const errorDiv = document.getElementById('login-error');
  
  if (!username || !password) {
    errorDiv.textContent = '⚠️ Please enter both username and password';
    errorDiv.style.display = 'block';
    return;
  }

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    errorDiv.style.display = 'none';

    if (data.success) {
      // Login successful - hide login modal, show location modal
      document.getElementById('login-modal').style.display = 'none';
      document.getElementById('location-modal').style.display = 'flex';
      document.getElementById('username-input').value = '';
      document.getElementById('password-input').value = '';
    } else {
      // Login failed
      errorDiv.textContent = '❌ ' + (data.error || 'Invalid credentials');
      errorDiv.style.display = 'block';
    }
  } catch (err) {
    errorDiv.textContent = '❌ Connection error: ' + err.message;
    errorDiv.style.display = 'block';
  }
}

async function handleLogout() {
  await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
  // Hide all content modals, show login modal
  document.getElementById('dashboard-container').style.display = 'none';
  document.getElementById('location-modal').style.display = 'none';
  document.getElementById('login-modal').style.display = 'flex';
  // Reset forms
  document.getElementById('login-form').reset();
  document.getElementById('location-modal').querySelectorAll('select').forEach(s => s.value = '');
  document.getElementById('btn-enter').disabled = true;
  document.getElementById('login-error').style.display = 'none';
  selectedLocation = null;
}

// Helper to return the first feeder node found in the hierarchy
function getFirstFeeder(nodes) {
  for (const node of nodes) {
    if (node.feeders && node.feeders.length) {
      return node.feeders[0];
    }
    // search in child keys
    for (const key of ['zones','circles','divisions','subdivisions','substations']) {
      if (node[key]) {
        const found = getFirstFeeder(node[key]);
        if (found) return found;
      }
    }
  }
  return null;
}

// Add event listeners on page load
document.addEventListener('DOMContentLoaded', () => {
  const btnLogin = document.getElementById('btn-login');
  if (btnLogin) btnLogin.addEventListener('click', handleLoginSubmit);

  const linkSignup = document.getElementById('link-show-signup');
  if (linkSignup) linkSignup.addEventListener('click', (e) => { e.preventDefault(); showSignup(); });
  const linkLogin = document.getElementById('link-show-login');
  if (linkLogin) linkLogin.addEventListener('click', (e) => { e.preventDefault(); showLogin(); });

  const btnSignup = document.getElementById('btn-signup');
  if (btnSignup) btnSignup.addEventListener('click', handleSignupSubmit);

  const btnLogoutHeader = document.getElementById('logout-btn');
  if (btnLogoutHeader) btnLogoutHeader.addEventListener('click', handleLogout);

  const btnLogoutModal = document.getElementById('btn-logout');
  if (btnLogoutModal) btnLogoutModal.addEventListener('click', handleLogout);
});

// Initialize dashboard on page load
document.addEventListener('DOMContentLoaded', async () => {
  await loadLocationsAndInit();

  // Show login modal initially
  const lm = document.getElementById('login-modal');
  if (lm) lm.style.display = 'flex';
  // ensure login view
  showLogin();
  const lom = document.getElementById('location-modal');
  if (lom) lom.style.display = 'none';
  const dc = document.getElementById('dashboard-container');
  if (dc) dc.style.display = 'none';
});

// Cascade handlers
document.getElementById('sel-company').addEventListener('change', (e)=>{
  const cid = e.target.value; clearSelect('sel-zone'); clearSelect('sel-circle'); clearSelect('sel-division'); clearSelect('sel-subdivision'); clearSelect('sel-substation'); clearSelect('sel-feeder'); clearSelect('sel-dt');
  if(!cid) return;
  const comp = findNode(HIERARCHY, cid);
  const zones = comp.zones || [];
  document.getElementById('sel-zone').innerHTML = '<option value="">Select Zone</option>' + zones.map(z=>`<option value="${z.id}">${z.name}</option>`).join('');
});

document.getElementById('sel-zone').addEventListener('change', (e)=>{
  const cid = document.getElementById('sel-company').value;
  const zid = e.target.value; clearSelect('sel-circle'); clearSelect('sel-division'); clearSelect('sel-subdivision'); clearSelect('sel-substation'); clearSelect('sel-feeder'); clearSelect('sel-dt');
  if(!zid) return;
  const comp = findNode(HIERARCHY, cid);
  const zone = findNode(comp.zones, zid);
  document.getElementById('sel-circle').innerHTML = '<option value="">Select Circle</option>' + (zone.circles||[]).map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
});

document.getElementById('sel-circle').addEventListener('change', (e)=>{
  const cid = document.getElementById('sel-company').value;
  const zid = document.getElementById('sel-zone').value;
  const cirid = e.target.value; clearSelect('sel-division'); clearSelect('sel-subdivision'); clearSelect('sel-substation'); clearSelect('sel-feeder'); clearSelect('sel-dt');
  if(!cirid) return;
  const comp = findNode(HIERARCHY, cid);
  const zone = findNode(comp.zones, zid);
  const circle = findNode(zone.circles, cirid);
  document.getElementById('sel-division').innerHTML = '<option value="">Select Division</option>' + (circle.divisions||[]).map(d=>`<option value="${d.id}">${d.name}</option>`).join('');
});

document.getElementById('sel-division').addEventListener('change', (e)=>{
  const cid = document.getElementById('sel-company').value;
  const zid = document.getElementById('sel-zone').value;
  const cirid = document.getElementById('sel-circle').value;
  const did = e.target.value; clearSelect('sel-subdivision'); clearSelect('sel-substation'); clearSelect('sel-feeder'); clearSelect('sel-dt');
  if(!did) return;
  const comp = findNode(HIERARCHY, cid);
  const zone = findNode(comp.zones, zid);
  const circle = findNode(zone.circles, cirid);
  const division = findNode(circle.divisions, did);
  document.getElementById('sel-subdivision').innerHTML = '<option value="">Select Sub-division</option>' + (division.subdivisions||[]).map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
});

document.getElementById('sel-subdivision').addEventListener('change', (e)=>{
  const cid = document.getElementById('sel-company').value;
  const zid = document.getElementById('sel-zone').value;
  const cirid = document.getElementById('sel-circle').value;
  const did = document.getElementById('sel-division').value;
  const sid = e.target.value; clearSelect('sel-substation'); clearSelect('sel-feeder'); clearSelect('sel-dt');
  if(!sid) return;
  const comp = findNode(HIERARCHY, cid);
  const zone = findNode(comp.zones, zid);
  const circle = findNode(zone.circles, cirid);
  const division = findNode(circle.divisions, did);
  const subdivision = findNode(division.subdivisions, sid);
  document.getElementById('sel-substation').innerHTML = '<option value="">Select Substation</option>' + (subdivision.substations||[]).map(ss=>`<option value="${ss.id}">${ss.name}</option>`).join('');
});

document.getElementById('sel-substation').addEventListener('change', (e)=>{
  const cid = document.getElementById('sel-company').value;
  const zid = document.getElementById('sel-zone').value;
  const cirid = document.getElementById('sel-circle').value;
  const did = document.getElementById('sel-division').value;
  const sid = document.getElementById('sel-subdivision').value;
  const ssid = e.target.value; clearSelect('sel-feeder'); clearSelect('sel-dt');
  if(!ssid) return;
  const comp = findNode(HIERARCHY, cid);
  const zone = findNode(comp.zones, zid);
  const circle = findNode(zone.circles, cirid);
  const division = findNode(circle.divisions, did);
  const subdivision = findNode(division.subdivisions, sid);
  const ss = findNode(subdivision.substations, ssid);
  document.getElementById('sel-feeder').innerHTML = '<option value="">Select Feeder</option>' + (ss.feeders||[]).map(f=>`<option value="${f.id}">${f.name}</option>`).join('');
});

document.getElementById('sel-feeder').addEventListener('change', (e)=>{
  const sel = e.target;
  const selected = Array.from(sel.selectedOptions).map(o => o.value).filter(Boolean);
  clearSelect('sel-dt');
  const dtSelect = document.getElementById('sel-dt');

  // if multiple feeders selected, disable DT selection (ambiguous)
  if (selected.length > 1) {
    dtSelect.innerHTML = '<option value="">Multiple feeders selected — DT selection disabled</option>';
    dtSelect.disabled = true;
  } else if (selected.length === 1) {
    dtSelect.disabled = false;
    const fid = selected[0];
    // find feeder under current selection
    const cid = document.getElementById('sel-company').value;
    const zid = document.getElementById('sel-zone').value;
    const cirid = document.getElementById('sel-circle').value;
    const did = document.getElementById('sel-division').value;
    const sid = document.getElementById('sel-subdivision').value;
    const ssid = document.getElementById('sel-substation').value;
    const comp = findNode(HIERARCHY, cid);
    const zone = findNode(comp.zones, zid);
    const circle = findNode(zone.circles, cirid);
    const division = findNode(circle.divisions, did);
    const subdivision = findNode(division.subdivisions, sid);
    const ss = findNode(subdivision.substations, ssid);
    const feeder = findNode(ss.feeders, fid);
    dtSelect.innerHTML = '<option value="">Select DT (optional)</option>' + (feeder.dts||[]).map(dt=>`<option value="${dt.id}">${dt.name}</option>`).join('');
  } else {
    dtSelect.disabled = false;
    dtSelect.innerHTML = '<option value="">Select DT (optional)</option>';
  }

  // enable enter when at least one feeder chosen
  document.getElementById('btn-enter').disabled = selected.length === 0;
});

document.getElementById('sel-dt').addEventListener('change', (e)=>{
  // DT selection is optional - doesn't change enabling logic (feeder required)
});

// change location button - show location modal again
document.getElementById('change-location').addEventListener('click', () => {
  document.getElementById('location-modal').style.display = 'flex';
});

// Enter button: capture selection and show dashboard
document.getElementById('btn-enter').addEventListener('click', ()=>{
  const feederSel = document.getElementById('sel-feeder');
  const feederIds = Array.from(feederSel.selectedOptions).map(o => o.value).filter(Boolean);
  const dtId = document.getElementById('sel-dt').value;
  const companyName = document.getElementById('sel-company').selectedOptions[0].textContent;
  const zoneName = document.getElementById('sel-zone').selectedOptions[0].textContent;
  const feederNames = Array.from(feederSel.selectedOptions).map(o => o.textContent).filter(Boolean);
  const label = `${companyName} · ${zoneName} · ${feederNames.join(', ')}`;
  selectedLocation = { feederIds, dtId, label };
  document.getElementById('loc-name').textContent = selectedLocation.label;
  // Hide location modal, show dashboard
  document.getElementById('location-modal').style.display = 'none';
  document.getElementById('dashboard-container').style.display = 'block';
  // load dashboard now that location selected
  loadDashboard();
  loadAnomalyPie();
  loadFeeders();
});

// ── Main Data Load ──
async function loadDashboard() {
  let locParam = '';
  if (selectedLocation && selectedLocation.feederIds && selectedLocation.feederIds.length) {
    locParam = '&feeder_ids=' + encodeURIComponent(selectedLocation.feederIds.join(','));
  } else if (selectedLocation && selectedLocation.feederId) {
    locParam = '&feeder_id=' + encodeURIComponent(selectedLocation.feederId);
  }
  const res = await fetch('/api/dashboard-data?hours=168' + locParam, { credentials: 'same-origin' });
  const d = await res.json();

  // KPIs
  document.getElementById('kpi-peak').textContent = d.metrics.peak_load + ' MW';
  document.getElementById('kpi-avg').textContent  = d.metrics.avg_load + ' MW';
  document.getElementById('kpi-mape').textContent = d.metrics.mape + '%';
  document.getElementById('kpi-anomalies').textContent = d.metrics.anomaly_count;
  document.getElementById('kpi-rmse').textContent = d.metrics.rmse;
  document.getElementById('kpi-mae').textContent  = d.metrics.mae + ' MW';
  document.getElementById('threshold-display').textContent = 'Threshold: ' + d.threshold + ' MW';

  const labels = thinLabels(d.timestamps);

  // ── Overview Chart ──
  const octx = document.getElementById('overviewChart').getContext('2d');
  if (overviewChart) overviewChart.destroy();
  overviewChart = new Chart(octx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Actual Load',
          data: d.actual,
          borderColor: COLORS.cyan,
          backgroundColor: 'rgba(34,211,238,0.06)',
          borderWidth: 1.5,
          pointRadius: 0, tension: 0.3, fill: true,
        },
        {
          label: 'N-BEATS Forecast',
          data: d.forecast,
          borderColor: COLORS.yellow,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [4, 3],
          pointRadius: 0, tension: 0.3,
        }
      ]
    },
    options: chartOptions('Load (MW)')
  });

  // ── Forecast Tab: full chart ──
  const fctx = document.getElementById('forecastChart').getContext('2d');
  if (forecastChart) forecastChart.destroy();
  forecastChart = new Chart(fctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Actual', data: d.actual, borderColor: COLORS.cyan, borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: false },
        { label: 'N-BEATS Forecast', data: d.forecast, borderColor: COLORS.yellow, borderWidth: 1.5, borderDash: [5,3], pointRadius: 0, tension: 0.3 }
      ]
    },
    options: chartOptions('Load (MW)')
  });

  // ── Future 24h ──
  const futCtx = document.getElementById('futureChart').getContext('2d');
  if (futureChart) futureChart.destroy();
  futureChart = new Chart(futCtx, {
    type: 'line',
    data: {
      labels: d.future_timestamps.map(t => t.slice(11,16)),
      datasets: [{
        label: 'Day-Ahead Forecast',
        data: d.future_forecast,
        borderColor: COLORS.green,
        backgroundColor: 'rgba(52,211,153,0.08)',
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: COLORS.green,
        tension: 0.4, fill: true,
      }]
    },
    options: chartOptions('MW')
  });

  // ── Residuals ──
  const residuals = d.actual.map((a, i) => parseFloat((a - d.forecast[i]).toFixed(2)));
  const rCtx = document.getElementById('residualChart').getContext('2d');
  if (residualChart) residualChart.destroy();
  residualChart = new Chart(rCtx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Residual (Actual - Forecast)',
        data: residuals,
        backgroundColor: residuals.map(r => r > 0 ? 'rgba(248,113,113,0.6)' : 'rgba(96,165,250,0.6)'),
        borderRadius: 2,
      }]
    },
    options: {
      ...chartOptions('Residual (MW)'),
      plugins: { legend: { display: false } }
    }
  });

  // ── Anomaly Chart ──
  const aCtx = document.getElementById('anomalyChart').getContext('2d');
  if (anomalyChart) anomalyChart.destroy();
  const anomalyIndices = new Set(d.anomalies.map(a => a.index));
  const anomalyPoints = d.actual.map((v, i) => anomalyIndices.has(i) ? v : null);
  anomalyChart = new Chart(aCtx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Actual Load', data: d.actual, borderColor: COLORS.cyan, borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: false },
        { label: 'Forecast', data: d.forecast, borderColor: COLORS.yellow, borderWidth: 1.2, borderDash: [4,3], pointRadius: 0, tension: 0.3 },
        {
          label: 'Anomaly',
          data: anomalyPoints,
          borderColor: 'transparent',
          pointRadius: 5,
          pointBackgroundColor: COLORS.red,
          pointBorderColor: '#fff',
          pointBorderWidth: 1.5,
          showLine: false,
        }
      ]
    },
    options: chartOptions('Load (MW)')
  });

  // ── Anomaly Table ──
  buildAnomalyTable(d.anomalies, d.threshold);

  // ── Update Forecast KPI displays ──
  document.getElementById('forecast-mape-display').textContent = d.metrics.mape + '%';
  document.getElementById('forecast-mae-display').textContent = d.metrics.mae + ' MW';
  document.getElementById('forecast-peak-display').textContent = d.metrics.peak_load + ' MW';
  document.getElementById('forecast-avg-display').textContent = d.metrics.avg_load + ' MW';

  return d;
}

// ── Anomaly Pie Chart ──
async function loadAnomalyPie() {
  const res = await fetch('/api/anomaly-summary', { credentials: 'same-origin' });
  const d = await res.json();
  const pCtx = document.getElementById('anomalyPieChart').getContext('2d');
  if (anomalyPie) anomalyPie.destroy();
  anomalyPie = new Chart(pCtx, {
    type: 'doughnut',
    data: {
      labels: d.labels,
      datasets: [{
        data: d.values,
        backgroundColor: [COLORS.red, COLORS.orange, COLORS.yellow, COLORS.blue, COLORS.purple],
        borderColor: '#161d2e',
        borderWidth: 2,
      }]
    },
    options: {
      plugins: {
        legend: { position: 'bottom', labels: { padding: 14, font: { size: 10 } } }
      },
      cutout: '60%',
    }
  });
}

// ── Anomaly Cards Builder ──
function buildAnomalyTable(anomalies, threshold) {
  const container = document.getElementById('anomaly-cards-container') || document.getElementById('anomaly-tbody');
  const totalAnomaly = anomalies.length;
  const highCount = anomalies.filter(a => a.severity === 'HIGH').length;
  const mediumCount = anomalies.filter(a => a.severity === 'MEDIUM').length;

  // Update alert counts at top of anomaly section
  const normalStatus = totalAnomaly === 0 ? 'Healthy' : (totalAnomaly > 0 ? (totalAnomaly - highCount - mediumCount) : 0);
  const elHigh = document.getElementById('anomaly-count-high'); if (elHigh) elHigh.textContent = highCount;
  const elMed = document.getElementById('anomaly-count-medium'); if (elMed) elMed.textContent = mediumCount;
  const elNorm = document.getElementById('anomaly-count-normal'); if (elNorm) elNorm.textContent = totalAnomaly === 0 ? 'Healthy' : normalStatus;
  const elList = document.getElementById('anomaly-list-count'); if (elList) elList.textContent = totalAnomaly;

  if (!anomalies.length) {
    if (container) {
      container.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">
          <div style="font-size:48px;margin-bottom:10px;">✅</div>
          <div style="font-size:16px;font-weight:700;margin-bottom:6px;">No Anomalies Detected</div>
          <div>Grid is operating normally. All loads are within expected parameters.</div>
        </div>`;
    }
    return;
  }

  if (container && container.id === 'anomaly-cards-container') {
    container.innerHTML = anomalies.map((a, i) => `
      <div class="anomaly-detail-card severity-${a.severity.toLowerCase()}">
        <div class="anomaly-header-row">
          <div style="display:flex;gap:8px;align-items:center;">
            <span class="anomaly-type-badge">${a.type}</span>
            <span class="anomaly-severity-badge ${a.severity.toLowerCase()}">${a.severity}</span>
          </div>
          <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);">Index: ${a.index}</div>
        </div>

        <div class="anomaly-values">
          <div class="anomaly-value-item">
            <label>Actual Load</label>
            <div class="value anomaly-actual">${a.actual} MW</div>
          </div>
          <div class="anomaly-value-item">
            <label>Forecast</label>
            <div class="value anomaly-forecast">${a.forecast} MW</div>
          </div>
          <div class="anomaly-value-item">
            <label>Residual</label>
            <div class="value ${a.residual > 0 ? 'anomaly-residual-pos' : 'anomaly-residual-neg'}">${a.residual > 0 ? '+' : ''}${a.residual} MW</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-family:var(--font-mono);font-size:10px;color:var(--text-muted);">
          <div>Threshold: <span style="color:var(--accent-red);font-weight:700;">${a.threshold} MW</span></div>
          <div>Deviation: <span style="font-weight:700;">${((a.residual / a.forecast)*100).toFixed(1)}%</span></div>
        </div>

        <div class="anomaly-explanation">
          <strong style="color:var(--accent-cyan);">💡 AI Analysis:</strong> ${a.explanation}
        </div>
      </div>
    `).join('');
  } else if (container && container.id === 'anomaly-tbody') {
    // Fallback to old table format for compatibility
    container.innerHTML = anomalies.map((a, i) => `
      <tr>
        <td style="font-family:var(--font-mono);color:var(--text-muted)">${i + 1}</td>
        <td><span class="badge-type">${a.type}</span></td>
        <td><span class="${a.severity === 'HIGH' ? 'badge-high' : 'badge-medium'}">${a.severity}</span></td>
        <td style="font-family:var(--font-mono);color:var(--accent-cyan)">${a.actual}</td>
        <td style="font-family:var(--font-mono);color:var(--accent-yellow)">${a.forecast}</td>
        <td style="font-family:var(--font-mono);color:${a.residual > 0 ? 'var(--accent-red)' : 'var(--accent-blue)'}">${a.residual > 0 ? '+' : ''}${a.residual}</td>
        <td><div class="explanation-text">${a.explanation}</div></td>
      </tr>
    `).join('');
  }
}

// ── Feeder Status ──
async function loadFeeders() {
  if (!selectedLocation || !selectedLocation.feederIds && !selectedLocation.feederId) {
    const grid = document.getElementById('feeder-grid');
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">
      <div style="font-size:48px;margin-bottom:10px;">📍</div>
      <div style="font-size:16px;font-weight:700;margin-bottom:6px;">No Location Selected</div>
      <div>Please select a feeder from Location dropdown to view Distribution Transformer analytics.</div>
    </div>`;
    return;
  }
  // Build query param for one or more feeders
  let q = '';
  if (selectedLocation.feederIds && selectedLocation.feederIds.length) {
    q = '?feeder_ids=' + encodeURIComponent(selectedLocation.feederIds.join(','));
  } else if (selectedLocation.feederId) {
    q = '?feeder_id=' + encodeURIComponent(selectedLocation.feederId);
  }

  const res = await fetch('/api/feeder-status' + q, { credentials: 'same-origin' });
  const result = await res.json();
  const grid = document.getElementById('feeder-grid');

  // normalize to an array of feeder objects whether legacy or new
  const feeders = result.feeders || (result.data ? [result] : []);

  if (!feeders.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">
      <div style="font-size:48px;margin-bottom:10px;">⚠️</div>
      <div style="font-size:16px;font-weight:700;margin-bottom:6px;">No Distribution Transformers</div>
      <div>Selected feeder(s) have no DTs configured.</div>
    </div>`;
    return;
  }

  // Render each feeder block followed by its DT cards
  let html = '';
  feeders.forEach(f => {
    html += `<div style="grid-column:1/-1;padding:14px;background:rgba(52,211,153,0.12);border:1px solid var(--border);border-radius:8px;margin-bottom:8px;">
      <div style="font-size:13px;font-weight:700;color:var(--accent-green);">📍 Feeder: ${f.feeder_name}</div>
      <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">Total Distribution Transformers: ${f.total_dts}</div>
    </div>`;

    const dts = f.data || [];
    html += dts.map(dt => {
      const cls = dt.status === 'Alert' ? 'status-alert' : dt.status === 'Warning' ? 'status-warning' : 'status-normal';
      const fillCls = dt.utilization > 85 ? 'fill-red' : dt.utilization > 70 ? 'fill-orange' : 'fill-green';
      const chipCls = dt.status === 'Alert' ? 'chip-alert' : dt.status === 'Warning' ? 'chip-warning' : 'chip-normal';
      return `
      <div class="feeder-card ${cls}">
        <div class="feeder-name">🔌 ${dt.name}</div>
        <div style="font-size:10px;color:var(--text-muted);margin:6px 0 12px 0;">${dt.type} | ${dt.voltage}</div>
        <div class="feeder-stats">
          <div class="feeder-stat">
            <label>Current Load</label>
            <span style="color:var(--accent-cyan)">${dt.load} kVA</span>
          </div>
          <div class="feeder-stat">
            <label>Capacity</label>
            <span style="color:var(--text-secondary)">${dt.capacity} kVA</span>
          </div>
          <div class="feeder-stat">
            <label>Efficiency</label>
            <span style="color:var(--accent-green)">${dt.efficiency}%</span>
          </div>
          <div class="feeder-stat">
            <label>Losses</label>
            <span style="color:var(--accent-orange)">${dt.losses} kW</span>
          </div>
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-label">
            <span>Utilization</span><span>${dt.utilization}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill ${fillCls}" style="width:${dt.utilization}%"></div>
          </div>
        </div>
        <span class="status-chip ${chipCls}">${dt.status.toUpperCase()}</span>
      </div>
    `;
    }).join('');
  });

  grid.innerHTML = html;

  // Build aggregated DT Utilization chart across all returned DTs
  const allDts = feeders.flatMap(f => f.data || []);
  const fbCtx = document.getElementById('feederBarChart').getContext('2d');
  if (feederBarChart) feederBarChart.destroy();
  if (allDts.length === 0) return;

  feederBarChart = new Chart(fbCtx, {
    type: 'bar',
    data: {
      labels: allDts.map(dt => dt.name),
      datasets: [{
        label: 'DT Utilization %',
        data: allDts.map(dt => dt.utilization),
        backgroundColor: allDts.map(dt =>
          dt.utilization > 85 ? 'rgba(248,113,113,0.7)' :
          dt.utilization > 70 ? 'rgba(251,146,60,0.7)' :
          'rgba(52,211,153,0.7)'
        ),
        borderRadius: 4,
      }]
    },
    options: {
      ...chartOptions('%'),
      plugins: { legend: { display: false } }
    }
  });
}

// ── Shared Chart Options ──
function chartOptions(yLabel) {
  return {
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        labels: { boxWidth: 10, padding: 14, color: '#8a9abf', font: { size: 10 } }
      },
      tooltip: {
        backgroundColor: '#1c2540',
        borderColor: '#2a3a5c',
        borderWidth: 1,
        titleColor: '#e8edf5',
        bodyColor: '#8a9abf',
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(30,45,74,0.6)' },
        ticks: { maxRotation: 0 }
      },
      y: {
        grid: { color: 'rgba(30,45,74,0.6)' },
        title: { display: true, text: yLabel, color: '#4a5a7a', font: { size: 10 } }
      }
    }
  };
}

// Note: dashboard loads after user selects a location via the modal.
// ── Auto-refresh every 30s ──
setInterval(async () => {
  if (!selectedLocation) return;
  await loadDashboard();
  await loadAnomalyPie();
  await loadFeeders();
}, 30000);
