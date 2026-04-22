const mqtt = require('mqtt');

// Connect to the local MQTT broker that we started in server.js
const client = mqtt.connect('mqtt://139.59.38.168', { clientId: 'backend_subscriber_1' });

const targetTopic = 'manku/factory/machine1';

client.on('connect', () => {
    console.log(`✅ Backend Subscriber safely connected to MQTT broker!`);
    
    // Subscribe to the topic ESP32 is using
    client.subscribe(targetTopic, (err) => {
        if (!err) {
            console.log(`📡 Successfully subscribed to: \x1b[36m${targetTopic}\x1b[0m`);
            console.log(`⏳ Waiting for telemetry data stream...`);
        } else {
            console.error(`❌ Failed to subscribe:`, err);
        }
    });
});

// Listen for incoming messages on any subscribed topics
client.on('message', (topic, message) => {
    const payload = message.toString();
    const time = new Date().toLocaleTimeString();
    
    console.log(`\n📬 [${time}] Message triggered on \x1b[32m${topic}\x1b[0m`);
    
    try {
        // Parse the JSON payload coming from ESP32
        const data = JSON.parse(payload);
        
        // Log formatted structure
        console.log('📦 Parsed Sensor Data:');
        if (data.temp !== undefined) console.log(`   🌡️ Temperature : ${data.temp}`);
        if (data.volt !== undefined) console.log(`   ⚡ Voltage     : ${data.volt}`);
        if (data.rpm !== undefined)  console.log(`   ⚙️ RPM         : ${data.rpm}`);
        if (data.current !== undefined) console.log(`   🔌 Current     : ${data.current}`);
        
        // TODO: You could insert this parsed data into a Database here (like MongoDB or InfluxDB)
        
    } catch (e) {
        // If it's not valid JSON
        console.log(`📄 String Payload : ${payload}`);
    }
});

// Handle connection errors
client.on('error', (err) => {
    console.error('MQTT Connection Error:', err);
    client.end();
});
