const socket = io();

// ── UI Elements ────────────────────────────────────────────────
const connStatus = document.getElementById('conn-status');
const connDot    = document.getElementById('conn-dot');

const attachCard   = document.getElementById('attach-card');
const attachStatus = document.getElementById('attach-status');
const attachIcon   = document.getElementById('attach-icon-wrap');

const healthCard   = document.getElementById('health-card');
const healthStatus = document.getElementById('health-status');

const alertCard    = document.getElementById('alert-card');
const alertStatus  = document.getElementById('alert-status');

const calibBtn   = document.getElementById('calibrate-btn');
const calibToast = document.getElementById('calib-toast');

// ── Thresholds (matching ESP32 sensor configuration) ───────────
//
//  Displacement : detected when voltage == 0 V  (or displacement field == "Not OK")
//  Voltage      : abnormal when volt < 10 V
//  Current      : abnormal when current > 0.5 A
//  Vibration    : "Vibrating" = abnormal, "Normal" = ok
//  Temperature  : abnormal when temp > 50 °C
//
const THRESHOLDS = {
    temp:    { critical: 50  },   // °C
    volt:    { min_normal: 10 },  // V  (below this and >0 is abnormal)
    current: { warn: 0.5 }        // A
};

// ── Sensor display elements ────────────────────────────────────
const els = {
    temp:      { val: document.getElementById('val-temp'),      bar: document.getElementById('bar-temp'),      max: 100 },
    volt:      { val: document.getElementById('val-volt'),      bar: document.getElementById('bar-volt'),      max: 25  },
    vibration: { val: document.getElementById('val-vibration'), bar: document.getElementById('bar-vibration')           },
    current:   { val: document.getElementById('val-current'),   bar: document.getElementById('bar-current'),   max: 2   }
};

let baseline = null;

// ── Connection Events ──────────────────────────────────────────
socket.on('connect', () => {
    connStatus.textContent = 'Live Data Link';
    connDot.classList.replace('disconnected', 'connected');
});

socket.on('disconnect', () => {
    connStatus.textContent = 'Connection Lost';
    connDot.classList.replace('connected', 'disconnected');
    setAttachment('unknown');
    setHealth('unknown');
    setAlert('unknown');
});

// ── Incoming Sensor Data ───────────────────────────────────────
socket.on('sensor_data', (data) => {
    console.log('Received telemetry:', data);

    // Temperature
    if (data.temp !== undefined) {
        animateValue(els.temp.val, parseFloat(els.temp.val.innerText) || 0, data.temp);
        els.temp.bar.style.width = `${Math.min((data.temp / els.temp.max) * 100, 100)}%`;
    }

    // Voltage (ESP32 sends Volts, e.g. 12.34)
    if (data.volt !== undefined) {
        animateValue(els.volt.val, parseFloat(els.volt.val.innerText) || 0, data.volt);
        els.volt.bar.style.width = `${Math.min((data.volt / els.volt.max) * 100, 100)}%`;
    }

    // Vibration – text field ("Vibrating" / "Normal")
    if (data.vibration !== undefined) {
        els.vibration.val.innerText = data.vibration;
        const isVibrating = data.vibration === 'Vibrating';
        els.vibration.bar.style.width      = isVibrating ? '100%' : '10%';
        els.vibration.bar.style.background = isVibrating ? '#f87171' : '#34d399';
    }

    // Current (ESP32 sends Amps, e.g. 0.35)
    if (data.current !== undefined) {
        animateValue(els.current.val, parseFloat(els.current.val.innerText) || 0, data.current);
        els.current.bar.style.width = `${Math.min((data.current / els.current.max) * 100, 100)}%`;
    }

    evaluateStatus(data);
});

// ── Status Evaluation Engine ───────────────────────────────────
function evaluateStatus(data) {
    const { temp, volt, vibration, current, displacement } = data;

    // ── 1. Displacement detection ──────────────────────────────
    //    • Primary  : displacement field from ESP32 == "Not OK"
    //    • Secondary: voltage == 0 (machine has no power = displaced)
    const voltIsZero = (volt !== undefined && volt === 0);
    const dispNotOk  = (displacement === 'Not OK');
    const isDisplaced = dispNotOk || voltIsZero;

    if (isDisplaced) {
        setAttachment('displaced');
    } else {
        setAttachment('attached');
    }

    // ── 2. Overall machine health ──────────────────────────────
    let severity = 'ok';

    // Temperature abnormal above 50°C
    if (temp !== undefined && temp > THRESHOLDS.temp.critical) {
        severity = escalate(severity, 'critical');
    }

    // Voltage abnormal below 10V (but only if not zero — zero is displacement)
    if (volt !== undefined && volt > 0 && volt < THRESHOLDS.volt.min_normal) {
        severity = escalate(severity, 'warn');
    }

    // Current abnormal above 0.5A
    if (current !== undefined && current > THRESHOLDS.current.warn) {
        severity = escalate(severity, 'warn');
    }

    // Vibration "Vibrating" is abnormal
    if (vibration === 'Vibrating') {
        severity = escalate(severity, 'warn');
    }

    // Displacement is critical
    if (isDisplaced) {
        severity = escalate(severity, 'critical');
    }

    setHealth(severity);
    setAlert(severity, data);
}

function escalate(current, incoming) {
    const order = ['ok', 'warn', 'danger', 'critical'];
    return order.indexOf(incoming) > order.indexOf(current) ? incoming : current;
}

// ── Status Setters ─────────────────────────────────────────────

function setAttachment(state) {
    attachCard.className = 'status-card';
    switch (state) {
        case 'attached':
            attachCard.classList.add('state-ok');
            attachStatus.textContent = 'Securely Attached';
            setIcon(attachIcon, iconCheck());
            break;
        case 'displaced':
            attachCard.classList.add('state-critical');
            attachStatus.textContent = '⚠ Displacement Detected';
            setIcon(attachIcon, iconDisplace());
            break;
        default:
            attachStatus.textContent = 'Checking...';
            setIcon(attachIcon, iconBolt());
    }
}

function setHealth(severity) {
    healthCard.className = 'status-card';
    switch (severity) {
        case 'ok':
            healthCard.classList.add('state-ok');
            healthStatus.textContent = 'Running Normal';
            setIcon(document.getElementById('health-icon-wrap'), iconPulse());
            break;
        case 'warn':
            healthCard.classList.add('state-warn');
            healthStatus.textContent = 'Partial Fault Detected';
            setIcon(document.getElementById('health-icon-wrap'), iconWarn());
            break;
        case 'danger':
            healthCard.classList.add('state-danger');
            healthStatus.textContent = 'Partial Machine Failure';
            setIcon(document.getElementById('health-icon-wrap'), iconWarn());
            break;
        case 'critical':
            healthCard.classList.add('state-critical');
            healthStatus.textContent = 'TOTAL MACHINE FAILURE';
            setIcon(document.getElementById('health-icon-wrap'), iconCritical());
            break;
        default:
            healthStatus.textContent = 'Awaiting Data...';
            setIcon(document.getElementById('health-icon-wrap'), iconPulse());
    }
}

function setAlert(severity, data) {
    alertCard.className = 'status-card';

    if (severity === 'ok') {
        alertCard.classList.add('state-ok');
        alertStatus.textContent = 'All Systems Normal';
        setIcon(document.getElementById('alert-icon-wrap'), iconOk());
        return;
    }

    let msg = '';
    if (data) {
        const { temp, volt, current, vibration, displacement } = data;
        const voltIsZero = (volt !== undefined && volt === 0);
        const dispNotOk  = (displacement === 'Not OK');

        if (dispNotOk || voltIsZero) {
            msg = `Displacement Detected! Voltage: ${volt !== undefined ? volt.toFixed(2) : '?'} V`;
        } else if (temp !== undefined && temp > THRESHOLDS.temp.critical) {
            msg = `High Temp: ${temp.toFixed(1)}°C  (threshold: >${THRESHOLDS.temp.critical}°C)`;
        } else if (current !== undefined && current > THRESHOLDS.current.warn) {
            msg = `High Current: ${current.toFixed(2)} A  (threshold: >${THRESHOLDS.current.warn} A)`;
        } else if (volt !== undefined && volt > 0 && volt < THRESHOLDS.volt.min_normal) {
            msg = `Low Voltage: ${volt.toFixed(2)} V  (threshold: <${THRESHOLDS.volt.min_normal} V)`;
        } else if (vibration === 'Vibrating') {
            msg = 'Abnormal Vibration Detected';
        } else {
            msg = 'Anomaly Detected';
        }
    }

    switch (severity) {
        case 'warn':
            alertCard.classList.add('state-warn');
            alertStatus.textContent = msg || 'Warning — Check Machine';
            setIcon(document.getElementById('alert-icon-wrap'), iconAlertTri());
            break;
        case 'danger':
            alertCard.classList.add('state-danger');
            alertStatus.textContent = msg || 'Partial Failure Alert!';
            setIcon(document.getElementById('alert-icon-wrap'), iconAlertTri());
            break;
        case 'critical':
            alertCard.classList.add('state-critical');
            alertStatus.textContent = msg || 'CRITICAL FAILURE!';
            setIcon(document.getElementById('alert-icon-wrap'), iconAlertTri());
            break;
        default:
            alertStatus.textContent = 'No Alert';
    }
}

// ── Calibration Button ─────────────────────────────────────────
calibBtn.addEventListener('click', () => {
    baseline = {
        temp:    parseFloat(els.temp.val.innerText)    || 0,
        volt:    parseFloat(els.volt.val.innerText)    || 0,
        current: parseFloat(els.current.val.innerText) || 0,
    };
    socket.emit('calibrate', baseline);
    console.log('Calibration baseline captured:', baseline);
    calibBtn.classList.add('busy');
    showToast();
    setTimeout(() => calibBtn.classList.remove('busy'), 3000);
});

function showToast() {
    calibToast.classList.add('show');
    setTimeout(() => calibToast.classList.remove('show'), 3500);
}

// ── Helpers ────────────────────────────────────────────────────
function setIcon(wrap, svgString) { if (wrap) wrap.innerHTML = svgString; }

function iconCheck()    { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`; }
function iconDisplace() { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`; }
function iconBolt()     { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`; }
function iconPulse()    { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`; }
function iconWarn()     { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`; }
function iconCritical() { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`; }
function iconOk()       { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`; }
function iconAlertTri() { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`; }

// ── Number Animation ───────────────────────────────────────────
function animateValue(obj, start, end) {
    if (start === end) return;
    if (Math.abs(end - start) > 50) { obj.innerText = end.toFixed ? end.toFixed(2) : end; return; }

    let count = 0;
    const steps = 20;
    const increment = (end - start) / steps;
    let current = start;

    const timer = setInterval(() => {
        current += increment;
        count++;
        obj.innerText = current.toFixed(2);
        if (count >= steps) {
            obj.innerText = end.toFixed ? end.toFixed(2) : end;
            clearInterval(timer);
        }
    }, 25);
}
