import re

# Fix the DOMContentLoaded to not auto-load dashboard
filepath = 'static/js/dashboard.js'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the auto-loading code with login modal display
old_code = """  // Show login modal initially
  const lm = document.getElementById('login-modal');
  if (lm) lm.style.display = 'flex';
  const lom = document.getElementById('location-modal');
  if (lom) lom.style.display = 'none';
  document.getElementById('dashboard-container').style.display = 'block';

  // load data
  loadDashboard();
  loadAnomalyPie();
  loadFeeders();"""

new_code = """  // Show login modal initially
  const lm = document.getElementById('login-modal');
  if (lm) lm.style.display = 'flex';
  const lom = document.getElementById('location-modal');
  if (lom) lom.style.display = 'none';
  const dc = document.getElementById('dashboard-container');
  if (dc) dc.style.display = 'none';"""

content = content.replace(old_code, new_code)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("✓ Fixed DOMContentLoaded initialization")
