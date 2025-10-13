# node-red-contrib-flasher (IoTempower helper for Node-RED)

A single Node-RED runtime node that **initializes & configures** an IoTempower node folder, **generates basic sensor setup code**, and **flashes** the device via USB or **RFC2217** using `iot exec deploy serial`.

> Previously separate “folder init + Wi‑Fi/MQTT” duties are now built into **flasher** — no extra nodes required.

---

## Table of contents
- [Features](#features)
- [Installation](#installation)
- [Nodes in the palette](#nodes-in-the-palette)
- [Configuration & runtime overrides](#configuration--runtime-overrides)
- [Runtime behavior](#runtime-behavior)
- [Deployment methods](#deployment-methods)
- [Supported sensors](#supported-sensors)
- [Filters](#filters)
- [Outputs](#outputs)
- [HTTP admin endpoints](#http-admin-endpoints)
- [Examples](#examples)
- [License](#license)

---

## Features

- **Folder & system bootstrap**
  - Create / list / rename **node subfolders** from the editor (via HTTP admin endpoints).
  - On first run, if `<folder>/system.conf` is missing, copy templates from `resources/system.conf` and `resources/node_template`.
  - Write Wi‑Fi/MQTT to `system.conf`:
    - `IOTEMPOWER_AP_NAME` (SSID)
    - `IOTEMPOWER_AP_PASSWORD`
    - `IOTEMPOWER_MQTT_HOST` (defaults to `192.168.14.1` if not provided)
  - Persist board selection to `node.conf` as `board="..."`.

- **Controller & sensors**
  - Controllers: `Wemos D1 Mini`, `m5stickc_plus`, `m5stickc_plus2`.
  - Generate `setup.cpp` lines for each configured sensor (+ optional filter).

---

## Installation

```bash
# Clone the repository
git clone https://github.com/fedirky/IoTempire-newNodes.git
cd IoTempire-newNodes/node-red-contrib-flasher

# Install & link the node
npm install
npm link

# Link into your local Node-RED user dir
cd ~/.node-red
npm link node-red-contrib-flasher

# Restart Node-RED (IoTempower helpers shown here)
iot exec node-red-stop
iot exec node-red
```
> Ensure the **`iot`** CLI is installed and available in `PATH`.

---

## Nodes in the palette

### 1) Config — `flasher-folder`
Holds base folder and default credentials.
- **Folder** (e.g., `~/iot-systems/demo`)
- **WiFi SSID** / **WiFi Password**
- **MQTT Host** (e.g., `192.168.14.1`)
- **Name** (optional)

### 2) Config — `flasher-node`
References a `flasher-folder` and a specific node subfolder.
- **Folder** (reference to `flasher-folder`)
- **Node Name** (e.g., `test01`)
- **Name** (optional)

### 3) Runtime — `flasher`
- **Folder** (reference to `flasher-folder`)
- **Node Name**
- **Controller Type** (see supported list)
- **Sensors 1–3**: type, pins, MQTT channel, optional filter (+ params)
- **Serial Port** (USB only, e.g., `/dev/ttyUSB0`)
- **Name** (optional)

---

## Configuration & runtime overrides

Any field can be overridden by message properties at runtime:

| Property | Type | Notes |
|---|---|---|
| `folder` | string | Base IoTempower folder, supports `~/`. |
| `nodeName` | string | Subfolder for the device. |
| `controllerType` | string | One of `Wemos D1 Mini`, `m5stickc_plus`, `m5stickc_plus2`. |
| `port` | string | `/dev/ttyUSB*` (USB) or `rfc2217://host:port` (network serial). |
| `wifiSSID` | string | Writes to `system.conf`. |
| `wifiPassword` | string | Writes to `system.conf`. |
| `mqttHost` | string | Writes to `system.conf`, default `192.168.14.1`. |
| `sensor[1..3]` | string | Sensor code (see table). |
| `mqttChannel[1..3]` | string | MQTT channel for sensor. |
| `sensor[1..3]Pins` | string | CSV pins per sensor/controller (e.g., `D5,D6`). |
| `filter[1..3]Type` | string | Filter name (see [Filters](#filters)). |
| `filter[1..3]Params` | object / JSON | Filter params (e.g., `{"buflen":100}`). |

Example override payload:
```js
msg.folder         = "~/iot-systems/demo01";
msg.nodeName       = "node1";
msg.controllerType = "Wemos D1 Mini";

msg.port           = "/dev/ttyUSB1";         // or rfc2217://192.168.14.1:5000

msg.sensor1        = "dht";
msg.mqttChannel1   = "kitchen/temperature";
msg.sensor1Pins    = "5";
msg.filter1Type    = "average";
msg.filter1Params  = { buflen: 100 };
```

---

## Runtime behavior

On **Deploy**, the node:
1. Ensures folder structure exists (initializes from templates if needed).
2. Updates `system.conf` (Wi‑Fi & MQTT).
3. Writes `node.conf` (board).
4. Regenerates `setup.cpp` entries for configured sensors (+ filters).
5. Executes flashing via `iot exec deploy serial ...`.

**Node status:** “flashing” during execution → “done” on success → red error on failure.

---

## Deployment methods

The method is chosen from the **port** value:
- `rfc2217://host:port` → **RFC2217 (network serial)** → `iot exec deploy serial rfc2217://host:port`
- anything else (or empty) → **USB** → `iot exec deploy serial --upload-port "<port>"` (defaults to `/dev/ttyUSB0`)

---

## Supported sensors

| Code | Description | Pins |
|---|---|---|
| `bmp085` | Barometer | `SDA,SCL` |
| `bmp180` | Barometer | `SDA,SCL` |
| `bmp280` | Barometer | `SDA,SCL` |
| `button` | Input button | `Pin` |
| `display` | SSD1306/u8g2 display | `SDA,SCL` |
| `display44780` | LCD display | `SDA,SCL` |
| `dht` | Temp/Humidity | `Pin` (1) |
| `gyro6050` | MPU6050 | `SDA,SCL` |
| `gyro9250` | MPU9250 | `SDA,SCL` |
| `hx711` | Load cell | `SCK,DOUT` |
| `output` | LED/Relay output | `Pin` |
| `mpr121` | Capacitive touch | `SDA,SCL` |
| `hcsr04` | Ultrasonic distance | `TRIG,ECHO` |
| `mfrc522` | MFRC522 tag reader | *(HW SPI)* |
| `pwm` | PWM output | `Pin` |
| `rgb_single` | RGB LED | `R,G,B` |
| `rgb_single_inverted` | RGB LED (inverted) | `R,G,B` |
| `rgb_strip_grb` | RGB LED strip GRB | `DataPin` |
| `rgb_strip_brg` | RGB LED strip BRG | `DataPin` |
| `servo` | Servo motor | `Pin` |
| `servo_switch` | Servo switch | `Pin` |

---

## Filters

Append a filter to each sensor’s chain (rendered into `setup.cpp`):
- `average(buflen)` → `.filter_average(buflen)`
- `jmc_median()` → `.filter_jmc_median()`
- `jmc_interval_median(update_ms | reset_each_ms)`
- `minchange(minchange)`
- `binarize(cutoff, high, low)`
- `round(base)`
- `limit_time(interval)`
- `detect_click(...)`
- `interval_map(...)`

---

## Outputs

**Success**
```json
{
  "success": true,
  "output": "[stdout]",
  "port": "/dev/ttyUSB0",
  "method": "usb"
}
```

**Error**
```json
{
  "success": false,
  "error": "[stderr or error message]"
}
```

---

## HTTP admin endpoints

Used by the editor UI for folder management:
- `GET  /flasher/list-nodes?folder=~/iot-systems/demo` → list subfolders
- `POST /flasher/create-node` `{ folder, nodeName }`
- `POST /flasher/rename-node` `{ folder, from, to }`

---

## Examples

**USB (default port)**

```json
{
  "folder": "~/iot-systems/demo",
  "nodeName": "kitchen",
  "controllerType": "Wemos D1 Mini",
  "sensor1": "dht",
  "mqttChannel1": "home/kitchen/temperature",
  "sensor1Pins": "D5",
  "filter1Type": "average",
  "filter1Params": { "buflen": 50 }
}
```

**RFC2217 (“Mango”)**

```json
{
  "folder": "~/iot-systems/demo",
  "nodeName": "livingroom",
  "controllerType": "m5stickc_plus2",
  "port": "rfc2217://192.168.14.1:5000",
  "wifiSSID": "MyAP",
  "wifiPassword": "secret123",
  "mqttHost": "192.168.14.1"
}
```

---

## License

MIT © Fedir Kyrychenko
