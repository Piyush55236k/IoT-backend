const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mqtt = require('mqtt');

const webPort = 3000;

// Initialize Express & HTTP Server & Socket.IO
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);

// Serve the 'public' directory
app.use(express.static('public'));

// Setup Socket.IO
io.on('connection', (socket) => {
  console.log(`🔌 Web client connected: \x1b[36m${socket.id}\x1b[0m`);
  
  socket.on('disconnect', () => {
    console.log(`🔌 Web client disconnected: \x1b[31m${socket.id}\x1b[0m`);
  });
});

// Setup MQTT Client to connect to the remote broker
const brokerUrl = 'mqtt://139.59.38.168';
const targetTopic = 'manku/factory/machine1';
const mqttClient = mqtt.connect(brokerUrl);

mqttClient.on('connect', () => {
  console.log(`✅ Server connected to remote MQTT broker at ${brokerUrl}`);
  mqttClient.subscribe(targetTopic, (err) => {
    if (!err) {
      console.log(`📡 Server actively listening to topic: \x1b[36m${targetTopic}\x1b[0m for Web Bridge`);
    } else {
      console.error(`❌ Server failed to subscribe:`, err);
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
      console.log('📄 Raw payload (Not valid JSON) ignored for UI:', payloadString);
    }
  }
});

mqttClient.on('error', (err) => {
  console.error('[MQTT Error]', err);
});

// Start Web Server
httpServer.listen(webPort, () => {
  console.log(`🌐 Web Dashboard server listening on http://localhost:${webPort}`);
});
