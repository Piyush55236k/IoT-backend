const socket = io();

// UI Elements
const connStatus = document.getElementById('conn-status');
const connDot = document.getElementById('conn-dot');

const els = {
    temp: { val: document.getElementById('val-temp'), bar: document.getElementById('bar-temp'), max: 5000 },
    volt: { val: document.getElementById('val-volt'), bar: document.getElementById('bar-volt'), max: 5000 },
    rpm: { val: document.getElementById('val-rpm'), bar: document.getElementById('bar-rpm'), max: 10000 },
    current: { val: document.getElementById('val-current'), bar: document.getElementById('bar-current'), max: 1000 }
};

// Handle Connection
socket.on('connect', () => {
    connStatus.textContent = 'Live Data Link';
    connDot.classList.replace('disconnected', 'connected');
});

socket.on('disconnect', () => {
    connStatus.textContent = 'Connection Lost';
    connDot.classList.replace('connected', 'disconnected');
});

// Handle incoming sensor data from backend
socket.on('sensor_data', (data) => {
    console.log('Received telemetry:', data);

    // Update each property safely
    ['temp', 'volt', 'rpm', 'current'].forEach(key => {
        if (data[key] !== undefined) {
            // Animate value counter using a simple update
            animateValue(els[key].val, parseInt(els[key].val.innerText) || 0, data[key]);
            
            // Update progress bar
            const percentage = Math.min((data[key] / els[key].max) * 100, 100);
            els[key].bar.style.width = `${percentage}%`;
        }
    });
});

// Simple Number Count Animation for visual flair
function animateValue(obj, start, end) {
    if (start === end) return;
    let current = start;
    const range = end - start;
    const increment = end > start ? 1 : -1;
    let stepTime = Math.abs(Math.floor(500 / range));
    if(stepTime < 10) stepTime = 10;
    
    // Instead of complex interval, just directly update if change is huge or step is too fast
    if(Math.abs(range) > 100) {
        obj.innerText = end;
        return;
    }

    const timer = setInterval(() => {
        current += increment;
        obj.innerText = current;
        if (current === end) clearInterval(timer);
    }, stepTime);
}
