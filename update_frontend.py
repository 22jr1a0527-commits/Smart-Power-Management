# Update loadFeeders to show location-specific analytics

old_func = '''async function loadFeeders() {
  const res = await fetch('/api/feeder-status', { credentials: 'same-origin' });
  const feeders = await res.json();

  const grid = document.getElementById('feeder-grid');
  grid.innerHTML = feeders.map(f => {
    const cls = f.status === 'Alert' ? 'status-alert' : f.status === 'Warning' ? 'status-warning' : 'status-normal';
    const fillCls = f.utilization > 85 ? 'fill-red' : f.utilization > 70 ? 'fill-orange' : 'fill-green';
    const chipCls = f.status === 'Alert' ? 'chip-alert' : f.status === 'Warning' ? 'chip-warning' : 'chip-normal';
    return `
      <div class="feeder-card ${cls}">
        <div class="feeder-name">⚡ ${f.name}</div>
        <div class="feeder-stats">
          <div class="feeder-stat">
            <label>Current Load</label>
            <span style="color:var(--accent-cyan)">${f.load} MW</span>
          </div>
          <div class="feeder-stat">
            <label>Capacity</label>
            <span style="color:var(--text-secondary)">${f.capacity} MW</span>
          </div>
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-label">
            <span>Utilization</span><span>${f.utilization}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill ${fillCls}" style="width:${f.utilization}%"></div>
          </div>
        </div>
        <span class="status-chip ${chipCls}">${f.status.toUpperCase()}</span>
      </div>
    `;
  }).join('');'''

new_func = '''async function loadFeeders() {
  if (!selectedLocation || !selectedLocation.feederId) {
    const grid = document.getElementById('feeder-grid');
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">
      <div style="font-size:48px;margin-bottom:10px;">📍</div>
      <div style="font-size:16px;font-weight:700;margin-bottom:6px;">No Location Selected</div>
      <div>Please select a feeder from Location dropdown to view Distribution Transformer analytics.</div>
    </div>`;
    return;
  }

  const res = await fetch('/api/feeder-status?feeder_id=' + selectedLocation.feederId, { credentials: 'same-origin' });
  const result = await res.json();
  const dts = result.data || [];

  const grid = document.getElementById('feeder-grid');
  
  if (!dts.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">
      <div style="font-size:48px;margin-bottom:10px;">⚠️</div>
      <div style="font-size:16px;font-weight:700;margin-bottom:6px;">No Distribution Transformers</div>
      <div>Selected feeder has no DTs configured.</div>
    </div>`;
    return;
  }

  grid.innerHTML = `<div style="grid-column:1/-1;padding:14px;background:rgba(52,211,153,0.12);border:1px solid var(--border);border-radius:8px;margin-bottom:16px;">
    <div style="font-size:13px;font-weight:700;color:var(--accent-green);">📍 Feeder: ${result.feeder_name}</div>
    <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">Total Distribution Transformers: ${result.total_dts}</div>
  </div>` + dts.map(dt => {
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
  }).join('');'''

with open('static/js/dashboard.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(old_func, new_func)

with open('static/js/dashboard.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("✓ Updated loadFeeders() to show location-specific analytics")
