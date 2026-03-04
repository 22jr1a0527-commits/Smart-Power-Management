"""
AI-Driven Electricity Demand Forecasting & Explainable Anomaly Detection
Flask Web Application for DISCOMs
Batch 07 - KKR & KSR Institute of Technology and Sciences
"""

from flask import Flask, render_template, jsonify, request, session
import os
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import json
import random

app = Flask(__name__)
app.secret_key = 'discom_secret_key_2026'

# ─────────────────────────────────────────────
# SAMPLE USERS (in production, use database)
# ─────────────────────────────────────────────
SAMPLE_USERS = {
    'operator1': {'password': 'discom123', 'name': 'Operator 1', 'role': 'Distribution Operator'},
    'operator2': {'password': 'discom456', 'name': 'Supervisor 2', 'role': 'Operations Manager'},
    'admin': {'password': 'admin123', 'name': 'Admin User', 'role': 'Administrator'},
}

# ─────────────────────────────────────────────
# SIMULATED OPERATIONAL HIERARCHY (Sample)
# ─────────────────────────────────────────────
# A simplified in-memory hierarchy for companies -> zones -> ... -> feeders -> DTs
HIERARCHY = [
    {
        "id": "BESCOM",
        "name": "BESCOM",
        "zones": [
            {
                "id": "BESCOM-NORTH",
                "name": "Bengaluru North Zone",
                "circles": [
                    {
                        "id": "INDIRANAGAR",
                        "name": "Indiranagar Circle",
                        "divisions": [
                            {
                                "id": "DIV-1",
                                "name": "Division 1",
                                "subdivisions": [
                                    {
                                        "id": "SUB-1",
                                        "name": "Sub-division 1",
                                        "substations": [
                                            {
                                                "id": "SS-101",
                                                "name": "Substation 101",
                                                "feeders": [
                                                    {
                                                        "id": "F-101-A",
                                                        "name": "Feeder 101-A",
                                                        "dts": [
                                                            {"id": "DT-1001", "name": "DT-1001"},
                                                            {"id": "DT-1002", "name": "DT-1002"}
                                                        ]
                                                    },
                                                    {
                                                        "id": "F-101-B",
                                                        "name": "Feeder 101-B",
                                                        "dts": [
                                                            {"id": "DT-1003", "name": "DT-1003"}
                                                        ]
                                                    }
                                                ]
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        ]
    }
]


# ─────────────────────────────────────────────
#  DATA GENERATION (Simulates Smart Meter Data)
# ─────────────────────────────────────────────

def generate_load_data(hours=168):
    """Generate realistic feeder-level electricity load data."""
    timestamps = [datetime.now() - timedelta(hours=hours - i) for i in range(hours)]
    base_load = 420  # MW baseline

    load = []
    for i, ts in enumerate(timestamps):
        hour = ts.hour
        day = ts.weekday()
        # Diurnal pattern
        diurnal = 80 * np.sin(np.pi * (hour - 6) / 12) if 6 <= hour <= 18 else -30
        # Weekend dip
        weekend_factor = -40 if day >= 5 else 0
        # Random noise
        noise = np.random.normal(0, 15)
        load.append(base_load + diurnal + weekend_factor + noise)

    return timestamps, load


# ─────────────────────────────────────────────
# Optional dataset loader (look for CSV/weekly pre-dispatch data)
# If datasets exist in a `data/` folder they will be loaded and used
# as a training source. If absent, the app falls back to simulated data.
# ─────────────────────────────────────────────
DATASETS = {}

def load_datasets():
    data_dir = os.path.join(os.path.dirname(__file__), 'data')
    if not os.path.exists(data_dir):
        return

    feeder_file = os.path.join(data_dir, 'feeder_smartmeter.csv')
    weekly_file = os.path.join(data_dir, 'weekly_predispatch.csv')

    try:
        if os.path.exists(feeder_file):
            DATASETS['feeder'] = pd.read_csv(feeder_file, parse_dates=True)
        if os.path.exists(weekly_file):
            DATASETS['weekly'] = pd.read_csv(weekly_file, parse_dates=True)
    except Exception as e:
        print('Warning: failed to load datasets:', e)


def nbeats_forecast(actual_load, forecast_horizon=24):
    """
    Simplified N-BEATS-inspired forecasting using trend + seasonality decomposition.
    In production, replace with a trained N-BEATS PyTorch model.
    """
    series = np.array(actual_load)
    n = len(series)

    # Trend block
    x = np.arange(n)
    trend_coeffs = np.polyfit(x, series, 1)
    trend = np.polyval(trend_coeffs, np.arange(n + forecast_horizon))

    # Seasonality block (24h period)
    season_len = 24
    seasonal = np.zeros(forecast_horizon)
    for h in range(forecast_horizon):
        season_vals = [series[i] - trend[i] for i in range(h, n, season_len) if i < n]
        seasonal[h] = np.mean(season_vals) if season_vals else 0

    # Combine: backcast residuals + forecast
    forecast = trend[n:n + forecast_horizon] + seasonal
    return forecast.tolist()


def adaptive_anomaly_detection(actual, forecast):
    """
    Adaptive Quantile-Based Anomaly Detection.
    Residual = Actual - Forecast; threshold = 95th percentile of rolling residuals.
    """
    residuals = np.array(actual) - np.array(forecast[:len(actual)])
    rolling_window = min(48, len(residuals))
    threshold = np.percentile(np.abs(residuals[-rolling_window:]), 95)

    anomalies = []
    for i, (res, act, frc) in enumerate(zip(residuals, actual, forecast)):
        if abs(res) > threshold:
            atype, explanation = classify_anomaly(res, act, frc)
            anomalies.append({
                "index": i,
                "actual": round(act, 2),
                "forecast": round(frc, 2),
                "residual": round(float(res), 2),
                "threshold": round(float(threshold), 2),
                "type": atype,
                "explanation": explanation,
                "severity": "HIGH" if abs(res) > 2 * threshold else "MEDIUM"
            })
    return anomalies, float(threshold)


def classify_anomaly(residual, actual, forecast):
    """Explainable AI Rule-Based Anomaly Classifier."""
    pct_dev = abs(residual / forecast * 100) if forecast != 0 else 0

    if actual < 50:
        return "Communication Loss", (
            f"Meter reading dropped to {actual:.1f} MW — possible communication or sensor failure. "
            f"Expected load was {forecast:.1f} MW. Verify meter connectivity immediately."
        )
    elif residual > 0 and pct_dev > 20:
        return "Load Spike", (
            f"Sudden surge of {residual:.1f} MW above forecast ({forecast:.1f} MW). "
            f"Possible causes: industrial load injection, transformer overload, or EV charging cluster. "
            f"Deviation: {pct_dev:.1f}%."
        )
    elif residual < 0 and pct_dev > 20:
        return "Load Drop", (
            f"Unexpected drop of {abs(residual):.1f} MW below forecast ({forecast:.1f} MW). "
            f"Possible causes: feeder tripping, scheduled outage, or power theft. "
            f"Deviation: {pct_dev:.1f}%."
        )
    elif residual > 0 and pct_dev > 10:
        return "Demand Drift", (
            f"Gradual upward drift of {residual:.1f} MW. Likely seasonal demand increase "
            f"or new consumer load. Review feeder capacity planning."
        )
    else:
        return "Meter Fault", (
            f"Inconsistent reading pattern detected. Actual: {actual:.1f} MW vs "
            f"expected: {forecast:.1f} MW. Inspect meter calibration."
        )


# Helper: find node by id in HIERARCHY
def find_node_by_id(node_list, node_id):
    for node in node_list:
        if node.get("id") == node_id:
            return node
        # recursively search child lists if present
        for key in ("zones", "circles", "divisions", "subdivisions", "substations", "feeders", "dts"):
            if key in node:
                found = find_node_by_id(node[key], node_id)
                if found:
                    return found
    return None


@app.route("/api/signup", methods=["POST"])
def signup():
    """Register a new user in the in‑memory SAMPLE_USERS dict.

    In a production system this would write to a database and properly
    hash passwords. Here we simply validate uniqueness and store the
    clear-text password for demo purposes.
    """
    data = request.get_json()
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    name = data.get('name', '').strip()

    if not username or not password or not name:
        return jsonify({"success": False, "error": "Name, username and password are required"}), 400

    if username in SAMPLE_USERS:
        return jsonify({"success": False, "error": "Username already exists"}), 409

    # create user with default role
    SAMPLE_USERS[username] = {'password': password, 'name': name, 'role': 'Operator'}
    return jsonify({"success": True}), 201


@app.route("/api/login", methods=["POST"])
def login():
    """Authenticate user with username/password."""
    data = request.get_json()
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    
    if not username or not password:
        return jsonify({"success": False, "error": "Username and password required"}), 400
    
    if username not in SAMPLE_USERS:
        return jsonify({"success": False, "error": "Invalid username or password"}), 401
    
    user = SAMPLE_USERS[username]
    if user['password'] != password:
        return jsonify({"success": False, "error": "Invalid username or password"}), 401
    
    # Store in session
    session['user_id'] = username
    session['user_name'] = user['name']
    session['user_role'] = user['role']
    
    return jsonify({"success": True, "user": {"name": user['name'], "role": user['role']}}), 200


@app.route("/api/logout", methods=["POST"])
def logout():
    """Log out the user."""
    session.clear()
    return jsonify({"success": True}), 200


@app.route("/api/user-status")
def user_status():
    """Get current user status."""
    if 'user_id' in session:
        return jsonify({"success": True, "user": {"name": session.get('user_name'), "role": session.get('user_role')}}), 200
    return jsonify({"success": False}), 200


@app.route("/api/locations")
def api_locations():
    """Return the simulated hierarchy for the frontend cascading selects."""
    return jsonify(HIERARCHY)


# ─────────────────────────────────────────────
#  ROUTES
# ─────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/dashboard-data")
def dashboard_data():
    """Main API: returns forecast, anomalies, and KPIs for the dashboard."""
    hours = int(request.args.get("hours", 168))
    feeder_id = request.args.get("feeder_id")
    feeder_ids_param = request.args.get('feeder_ids')

    # base series (simulated) - each feeder may get a deterministic offset
    timestamps, base_series = generate_load_data(hours)

    # If multiple feeders specified, average their series (deterministic offsets)
    actual = None
    selected_location = None
    if feeder_ids_param:
        feeder_ids = [f.strip() for f in feeder_ids_param.split(',') if f.strip()]
        per_series = []
        for fid in feeder_ids:
            # deterministic offset by feeder id
            seed = sum(ord(c) for c in fid)
            offset = (seed % 60) - 30
            per_series.append([v + offset for v in base_series])
        # aggregate as mean across feeders
        actual = list(np.mean(per_series, axis=0))
        selected_location = {"feeder_ids": feeder_ids, "label": f"{len(feeder_ids)} feeder(s) selected"}
    else:
        # backward compatible single feeder_id parameter
        actual = base_series
        if feeder_id:
            node = find_node_by_id(HIERARCHY, feeder_id)
            if node:
                selected_location = {"id": node.get("id"), "name": node.get("name")}
            seed = sum(ord(c) for c in feeder_id)
            offset = (seed % 60) - 30
            actual = [v + offset for v in actual]

    

    # Generate forecast for all actual data points
    train_len = max(48, hours - 24)
    forecast_vals = nbeats_forecast(actual[:train_len], forecast_horizon=hours)
    forecast_aligned = forecast_vals[:len(actual)]

    # Anomaly detection
    anomalies, threshold = adaptive_anomaly_detection(actual, forecast_aligned)

    # Future forecast (next 24h)
    future_forecast = nbeats_forecast(actual, forecast_horizon=24)
    future_timestamps = [
        (datetime.now() + timedelta(hours=i + 1)).strftime("%Y-%m-%d %H:%M")
        for i in range(24)
    ]

    # Model performance metrics
    errors = [abs(a - f) for a, f in zip(actual, forecast_aligned)]
    mae = np.mean(errors)
    mape = np.mean([abs((a - f) / a) * 100 for a, f in zip(actual, forecast_aligned) if a != 0])
    rmse = np.sqrt(np.mean([(a - f) ** 2 for a, f in zip(actual, forecast_aligned)]))

    return jsonify({
        "timestamps": [t.strftime("%Y-%m-%d %H:%M") for t in timestamps],
        "actual": [round(v, 2) for v in actual],
        "selected_location": selected_location,
        "forecast": [round(v, 2) for v in forecast_aligned],
        "anomalies": anomalies,
        "threshold": round(threshold, 2),
        "future_timestamps": future_timestamps,
        "future_forecast": [round(v, 2) for v in future_forecast],
        "metrics": {
            "mae": round(mae, 2),
            "mape": round(mape, 2),
            "rmse": round(rmse, 2),
            "anomaly_count": len(anomalies),
            "peak_load": round(max(actual), 2),
            "avg_load": round(np.mean(actual), 2),
        }
    })


@app.route("/api/anomaly-summary")
def anomaly_summary():
    """Returns anomaly type breakdown for pie chart."""
    _, actual = generate_load_data(168)
    forecast = nbeats_forecast(actual[:144], forecast_horizon=168)[:len(actual)]
    anomalies, _ = adaptive_anomaly_detection(actual, forecast)

    counts = {}
    for a in anomalies:
        counts[a["type"]] = counts.get(a["type"], 0) + 1

    return jsonify({
        "labels": list(counts.keys()),
        "values": list(counts.values())
    })


@app.route("/api/feeder-status")
def feeder_status():
    """Returns location-specific distribution transformer analytics.

    Supports either a single `feeder_id` (legacy) or multiple via
    comma-separated `feeder_ids` query parameter. When multiple feeders
    are requested, returns a `feeders` list with per-feeder DT analytics.
    """
    feeder_id = request.args.get('feeder_id')
    feeder_ids_param = request.args.get('feeder_ids')

    # Helper to build analytics for a feeder node
    def analytics_for_feeder(node):
        dts = node.get('dts', [])
        analytics = []
        for dt in dts:
            capacity = np.random.uniform(80, 150)
            load = np.random.uniform(capacity * 0.4, capacity * 0.95)
            utilization = round((load / capacity) * 100, 1)

            if utilization > 85:
                status = "Alert"
            elif utilization > 70:
                status = "Warning"
            else:
                status = "Normal"

            analytics.append({
                "id": dt.get('id'),
                "name": dt.get('name'),
                "type": "Distribution Transformer",
                "load": round(load, 2),
                "capacity": round(capacity, 2),
                "utilization": utilization,
                "status": status,
                "voltage": "11kV / 433V",
                "losses": round(np.random.uniform(0.5, 2.5), 2),
                "efficiency": round(np.random.uniform(95, 99), 2)
            })
        return {
            "feeder_id": node.get('id'),
            "feeder_name": node.get('name'),
            "total_dts": len(dts),
            "data": analytics
        }

    # Multiple feeders
    if feeder_ids_param:
        feeder_ids = [f.strip() for f in feeder_ids_param.split(',') if f.strip()]
        feeders_out = []
        for fid in feeder_ids:
            node = find_node_by_id(HIERARCHY, fid)
            if node:
                feeders_out.append(analytics_for_feeder(node))

        if not feeders_out:
            return jsonify({"message": "No feeders found for provided feeder_ids", "feeders": []}), 200

        return jsonify({"feeders": feeders_out}), 200

    # Legacy single feeder_id
    selected_feeder = None
    if feeder_id:
        selected_feeder = find_node_by_id(HIERARCHY, feeder_id)

    if not selected_feeder:
        return jsonify({"message": "Select a feeder from dropdown to view analytics", "data": []}), 200

    return jsonify(analytics_for_feeder(selected_feeder)), 200


if __name__ == "__main__":
    # Attempt to load datasets from `data/` if available
    load_datasets()
    app.run(debug=True, port=5000)
