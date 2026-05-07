const socket = io();

// ── UI Elements ────────────────────────────────────────────────
const connStatus = document.getElementById('conn-status');
const connDot    = document.getElementById('conn-dot');

const els = {
    temp:    { val: document.getElementById('val-temp'),    bar: document.getElementById('bar-temp'),    max: 120   },
    volt:    { val: document.getElementById('val-volt'),    bar: document.getElementById('bar-volt'),    max: 5000  },
    rpm:     { val: document.getElementById('val-rpm'),     bar: document.getElementById('bar-rpm'),     max: 10000 },
    current: { val: document.getElementById('val-current'), bar: document.getElementById('bar-current'), max: 1000  }
};

const attachCard   = document.getElementById('attach-card');
const attachStatus = document.getElementById('attach-status');
const attachIcon   = document.getElementById('attach-icon-wrap');

const healthCard   = document.getElementById('health-card');
const healthStatus = document.getElementById('health-status');

const alertCard    = document.getElementById('alert-card');
const alertStatus  = document.getElementById('alert-status');

const calibBtn     = document.getElementById('calibrate-btn');
const calibToast   = document.getElementById('calib-toast');

// ── Thresholds (tune these to your machine spec) ───────────────
const THRESHOLDS = {
    temp: {
        warn:     70,   // °C  – partial fault
        critical: 90    // °C  – total failure
    },
    volt: {
        min_warn:     3200, // mV  – low voltage warning
        min_critical: 2500, // mV  – critical low
        max_warn:     4500, // mV  – high voltage warning
        max_critical: 4800  // mV  – critical high
    },
    rpm: {
        min_ok:       200,  // below this = machine stopped / displaced
        warn:         8000, // over-speed warning
        critical:     9500  // over-speed critical
    },
    current: {
        warn:     800,  // mA – high current warning
        critical: 950   // mA – overcurrent = total fault
    }
};

// Calibration baseline (populated on calibrate)
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

    ['temp', 'volt', 'rpm', 'current'].forEach(key => {
        if (data[key] !== undefined) {
            animateValue(els[key].val, parseInt(els[key].val.innerText) || 0, data[key]);
            const percentage = Math.min((data[key] / els[key].max) * 100, 100);
            els[key].bar.style.width = `${percentage}%`;
        }
    });

    evaluateStatus(data);
});

// ── Status Evaluation Engine ───────────────────────────────────
function evaluateStatus(data) {
    const { temp, volt, rpm, current } = data;

    // 1. Attachment / Displacement detection (based on RPM)
    if (rpm !== undefined) {
        if (rpm < THRESHOLDS.rpm.min_ok) {
            setAttachment('displaced');   // machine not spinning — likely displaced or stopped
        } else {
            setAttachment('attached');
        }
    }

    // 2. Determine overall machine health
    let severity = 'ok'; // ok | warn | danger | critical

    // Temperature checks
    if (temp !== undefined) {
        if (temp >= THRESHOLDS.temp.critical) severity = escalate(severity, 'critical');
        else if (temp >= THRESHOLDS.temp.warn)    severity = escalate(severity, 'warn');
    }

    // Voltage checks
    if (volt !== undefined) {
        if (volt <= THRESHOLDS.volt.min_critical || volt >= THRESHOLDS.volt.max_critical) severity = escalate(severity, 'critical');
        else if (volt <= THRESHOLDS.volt.min_warn || volt >= THRESHOLDS.volt.max_warn)    severity = escalate(severity, 'warn');
    }

    // RPM checks (over-speed)
    if (rpm !== undefined) {
        if (rpm >= THRESHOLDS.rpm.critical) severity = escalate(severity, 'critical');
        else if (rpm >= THRESHOLDS.rpm.warn)    severity = escalate(severity, 'warn');
    }

    // Current checks
    if (current !== undefined) {
        if (current >= THRESHOLDS.current.critical) severity = escalate(severity, 'critical');
        else if (current >= THRESHOLDS.current.warn)    severity = escalate(severity, 'warn');
    }

    setHealth(severity);
    setAlert(severity, data);
}

// Returns the more severe of two severity levels
function escalate(current, incoming) {
    const order = ['ok', 'warn', 'danger', 'critical'];
    return order.indexOf(incoming) > order.indexOf(current) ? incoming : current;
}

// ── Status Setters ─────────────────────────────────────────────

function setAttachment(state) {
    // clear previous state classes
    attachCard.className = 'status-card';

    switch (state) {
        case 'attached':
            attachCard.classList.add('state-ok');
            attachStatus.textContent = 'Securely Attached';
            setIcon(attachIcon, iconCheck());
            break;
        case 'displaced':
            attachCard.classList.add('state-warn');
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

    // Build a human-readable alert message
    let msg = '';
    if (data) {
        const { temp, volt, rpm, current } = data;
        if (temp   >= THRESHOLDS.temp.critical)                         msg = `Temp critical: ${temp}°C`;
        else if (current >= THRESHOLDS.current.critical)               msg = `Overcurrent: ${current}mA`;
        else if (volt !== undefined && (volt <= THRESHOLDS.volt.min_critical || volt >= THRESHOLDS.volt.max_critical)) msg = `Voltage out of range: ${volt}mV`;
        else if (rpm   >= THRESHOLDS.rpm.critical)                     msg = `Over-speed: ${rpm} RPM`;
        else if (temp  >= THRESHOLDS.temp.warn)                        msg = `High temp: ${temp}°C`;
        else if (current >= THRESHOLDS.current.warn)                   msg = `High current: ${current}mA`;
        else if (rpm   >= THRESHOLDS.rpm.warn)                         msg = `High RPM: ${rpm}`;
        else if (volt !== undefined && (volt <= THRESHOLDS.volt.min_warn || volt >= THRESHOLDS.volt.max_warn)) msg = `Voltage warning: ${volt}mV`;
        else msg = 'Anomaly detected';
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
    // Capture current readings as baseline
    baseline = {
        temp:    parseInt(els.temp.val.innerText)    || 0,
        volt:    parseInt(els.volt.val.innerText)    || 0,
        rpm:     parseInt(els.rpm.val.innerText)     || 0,
        current: parseInt(els.current.val.innerText) || 0,
    };

    // Notify server to send calibrate command (optional — backend must handle 'calibrate' event)
    socket.emit('calibrate', baseline);
    console.log('Calibration baseline captured:', baseline);

    // UI feedback
    calibBtn.classList.add('busy');
    showToast();
    setTimeout(() => calibBtn.classList.remove('busy'), 3000);
});

function showToast() {
    calibToast.classList.add('show');
    setTimeout(() => calibToast.classList.remove('show'), 3500);
}

// ── Helpers ────────────────────────────────────────────────────

function setIcon(wrap, svgString) {
    wrap.innerHTML = svgString;
}

// SVG icon strings
function iconCheck()    { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`; }
function iconDisplace() { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`; }
function iconBolt()     { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`; }
function iconPulse()    { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`; }
function iconWarn()     { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`; }
function iconCritical() { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`; }
function iconOk()       { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`; }
function iconAlertTri() { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`; }

// ── Number Animation ──────────────────────────────────────────
function animateValue(obj, start, end) {
    if (start === end) return;
    if (Math.abs(end - start) > 100) { obj.innerText = end; return; }

    let current = start;
    const increment = end > start ? 1 : -1;
    let stepTime = Math.abs(Math.floor(500 / (end - start)));
    if (stepTime < 10) stepTime = 10;

    const timer = setInterval(() => {
        current += increment;
        obj.innerText = current;
        if (current === end) clearInterval(timer);
    }, stepTime);
}
