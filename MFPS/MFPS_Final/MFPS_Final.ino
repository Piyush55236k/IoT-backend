#include <WiFi.h>
#include <PubSubClient.h>

const char* ssid = "Excitel_BholeChature";
const char* password = "air@59466";
const char* mqtt_server = "64.227.162.243";

WiFiClient espClient;
PubSubClient client(espClient);

#define TEMP_PIN 33
#define VOLT_PIN 32

unsigned long lastPublish = 0;

// 🔹 WiFi
void setup_wifi() {
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.println("Wifi connecting!!");
  }
}

// 🔹 MQTT reconnect
void reconnect() {
  while (!client.connected()) {
    client.connect("ESP32_Client");
    Serial.println("Wifi connecting!!");
  }
}

// 🔹 Flexible Publisher with DEFAULT values
void publishData(uint16_t temp, uint16_t volt, uint16_t rpm = 10, uint16_t current = 10) {

  char payload[120];  // safe buffer

  snprintf(payload, sizeof(payload),
           "{\"temp\":%u,\"volt\":%u,\"rpm\":%u,\"current\":%u}",
           temp, volt, rpm, current);

  client.publish("manku/factory/machine1", payload);

  Serial.print("Published: ");
  Serial.println(payload);
}

void setup() {
  Serial.begin(115200);

  pinMode(TEMP_PIN, INPUT);
  pinMode(VOLT_PIN, INPUT);

  setup_wifi();
  client.setServer(mqtt_server, 1883);
}

void loop() {
  if (!client.connected()) reconnect();
  client.loop();

  if (millis() - lastPublish > 5000) {
    lastPublish = millis();

    uint16_t tempVal = analogRead(TEMP_PIN);
    uint16_t voltVal = analogRead(VOLT_PIN);

    // 🔹 Only 2 values pass → baaki auto 0 ho jayenge
    publishData(tempVal, voltVal);
  }
}
