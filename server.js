const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mqtt = require('mqtt');

const webPort = 80;

const app        = express();
const httpServer = http.createServer(app);
const io         = new Server(httpServer);

app.use(express.static('public'));

// ── Socket.IO ──────────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log(`🔌 Web client connected: \x1b[36m${socket.id}\x1b[0m`);

    // ── Calibration request from frontend ──────────────────────
    // The frontend emits 'calibrate' with the current sensor baseline.
    // Here we forward that as a calibration command to the MQTT device.
    socket.on('calibrate', (baseline) => {
        console.log(`\n🎯 Calibration requested by client \x1b[36m${socket.id}\x1b[0m`);
        console.log('   Baseline snapshot:', baseline);

        // Publish a calibration command to the device topic (device must handle this)
        const calibPayload = JSON.stringify({ cmd: 'calibrate', baseline });
        mqttClient.publish(`${targetTopic}/cmd`, calibPayload, (err) => {
            if (err) {
                console.error('❌ Failed to publish calibration command:', err);
            } else {
                console.log(`📤 Calibration command published to \x1b[33m${targetTopic}/cmd\x1b[0m`);
            }
        });
    });

    socket.on('disconnect', () => {
        console.log(`🔌 Web client disconnected: \x1b[31m${socket.id}\x1b[0m`);
    });
});

// ── MQTT ───────────────────────────────────────────────────────
const brokerUrl   = 'mqtt://64.227.162.243';
const targetTopic = 'manku/factory/machine1';
const mqttClient  = mqtt.connect(brokerUrl);

mqttClient.on('connect', () => {
    console.log(`✅ Server connected to remote MQTT broker at ${brokerUrl}`);

    // Subscribe to sensor data topic
    mqttClient.subscribe(targetTopic, (err) => {
        if (!err) {
            console.log(`📡 Listening on topic: \x1b[36m${targetTopic}\x1b[0m`);
        } else {
            console.error(`❌ Subscription failed:`, err);
        }
    });
});

mqttClient.on('message', (topic, message) => {
    if (topic === targetTopic) {
        const payloadString = message.toString();
        console.log(`\n📬 Bridge received data on topic \x1b[32m${topic}\x1b[0m`);

        try {
            const data = JSON.parse(payloadString);
            console.log('📦 Forwarding to frontend:', data);
            io.emit('sensor_data', data);
        } catch (err) {
            console.log('📄 Raw payload (not valid JSON), ignored:', payloadString);
        }
    }
});

mqttClient.on('error', (err) => {
    console.error('[MQTT Error]', err);
});

// ── Start ──────────────────────────────────────────────────────
httpServer.listen(webPort, () => {
    console.log(`🌐 Dashboard live at http://localhost:${webPort}`);
});
