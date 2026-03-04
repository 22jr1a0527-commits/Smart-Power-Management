# Update HTML heading for Feeder Status tab

old_text = '''    <!-- FEEDER STATUS TAB -->
    <section id="tab-feeders" class="tab-section">
      <div class="section-heading">
        <h2>⚡ Feeder-Level Status Monitor</h2>
        <p>Real-time load utilization across all DISCOM distribution feeders | Green (<70%) = Safe | Orange (70-85%) = Caution | Red (>85%) = Critical</p>'''

new_text = '''    <!-- DISTRIBUTION TRANSFORMER ANALYTICS TAB -->
    <section id="tab-feeders" class="tab-section">
      <div class="section-heading">
        <h2>🔌 Distribution Transformer Analytics</h2>
        <p>Real-time distribution transformer monitoring for selected feeder | Shows utilization %, capacity, efficiency, and power losses | Green (<70%) = Safe | Orange (70-85%) = Caution | Red (>85%) = Critical</p>'''

with open('templates/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(old_text, new_text)

with open('templates/index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("✓ Updated HTML section heading for Distribution Transformer Analytics")
