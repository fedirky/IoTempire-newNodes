# node-red-contrib-flasher (IoTempower helper for Node-RED)

This repository currently contains **one** custom Node-RED node:

* **`node-red-contrib-flasher`** — manages an IoTempower node folder (init + config), generates basic sensor setup code, and **flashes** the device over serial (USB) or **RFC2217** using `iot exec deploy serial`.

> **Note:** The earlier `node-red-contrib-folder-init` node is not present in this repo. Its duties (folder init + Wi‑Fi/MQTT config) are handled by **flasher**.

---

## Features

### Folder & system bootstrap

* **List / create / rename** node subfolders directly from the Node‑RED editor (HTTP admin endpoints used by the UI).
* **Initializes** a node folder on first run:

  * If `<folder>/system.conf` is missing, the node tries to copy **`resources/system.conf`** and **`resources/node_template`** into the target structure.
  * If the node folder does not exist, it tries to copy **`resources/node_template`** there.
  * Writes Wi‑Fi/MQTT into `system.conf`:

    * `IOTEMPOWER_AP_NAME` (Wi‑Fi SSID)
    * `IOTEMPOWER_AP_PASSWORD`
    * `IOTEMPOWER_MQTT_HOST` (default `192.168.14.1` if not provided)
* Writes controller choice into `node.conf` as `board="..."`.

### Controller & sensors

* **Controller selection** (stored in `node.conf`):

  * `Wemos D1 Mini`
  * `m5stickc_plus`
  * `m5stickc_plus2`

* **Supported sensors (UI + validation mapping):**

  * `bmp085` — Barometer (SDA,SCL)
  * `bmp180` — Barometer (SDA,SCL)
  * `bmp280` — Barometer (SDA,SCL)
  * `button` — Input button (Pin)
  * `display` — SSD1306/u8g2 Display (SDA,SCL)
  * `display44780` — LCD Display (SDA,SCL)
  * `dht` — Temperature/Humidity (1 pin)
  * `gyro6050` — Gyroscope MPU6050 (SDA,SCL)
  * `gyro9250` — Gyroscope MPU9250 (SDA,SCL)
  * `hx711` — Load Cell / Weight Sensor (SCK,DOUT)
  * `output` — Output (LED/Relay) (Pin)
  * `mpr121` — Capacitive Touch (SDA,SCL)
  * `hcsr04` — Ultrasonic Distance (2 pins: trig,echo)
  * `mfrc522` — Tag Reader MFRC522 (0 pins, hardware SPI)
  * `pwm` — PWM Output (Pin)
  * `rgb_single` — RGB LED (R,G,B)
  * `rgb_single_inverted` — RGB LED inverted (R,G,B)
  * `rgb_strip_grb` — RGB LED Strip GRB (DataPin)
  * `rgb_strip_brg` — RGB LED Strip BRG (DataPin)
  * `servo` — Servo Motor (Pin)
  * `servo_switch` — Servo Switch (Pin)

On deploy, the node writes corresponding lines into `setup.cpp` for each configured sensor, along with optional **filters**.

### Filters

Each sensor may append a filter suffix in `setup.cpp`, for example:

* `average(buflen)` → `.filter_average(100)`
* `jmc_median()` → `.filter_jmc_median()`
* `jmc_interval_median(update_ms | reset_each_ms)`
* `minchange(minchange)`
* `binarize(cutoff, high, low)`
* `round(base)`
* `limit_time(interval)`
* `detect_click(...)`
* `interval_map(...)`

### Flashing / deploy

* **USB**: `iot exec deploy serial --upload-port "/dev/ttyUSB0"`
* **RFC2217 (network serial)**: `iot exec deploy serial rfc2217://<host>:<port>`
* The method is chosen **automatically** based on the `port` value:

  * If `port` starts with `rfc2217://` → **NET** (RFC2217)
  * Otherwise (or empty) → **USB** (`/dev/ttyUSB0` fallback)

---

## Nodes in the palette

### 1) Config: **`flasher-folder`**

Holds base folder and defaults for credentials.

* **Name** (optional)
* **Folder** (e.g. `~/iot-systems/demo`)
* **WiFi SSID** / **WiFi Password**
* **MQTT Host** (e.g. `192.168.14.1`)

### 2) Config: **`flasher-node`**

References a `flasher-folder` and a specific node subfolder.

* **Name** (optional)
* **Folder** (`flasher-folder` reference)
* **Node Name** (e.g. `test01`)

### 3) Runtime node: **`flasher`**

* **Name** (optional)
* **Folder** (`flasher-folder` reference)
* **Node Name**
* **Controller Type** (see list above)
* **Sensors 1–3** with **Pins**, **MQTT channel** and optional **Filter** (+ parameters)
* **Serial Port** (e.g. `/dev/ttyUSB0`, needed only for USB deployment)

On deploy, the node:

1. Ensures folder structure exists / initializes template if needed
2. Updates `system.conf` (Wi‑Fi & MQTT)
3. Writes `node.conf` (board)
4. Regenerates `setup.cpp` lines for configured sensors (+ filters)
5. Executes flashing via `iot exec deploy serial ...`

---

## Runtime overrides (via `msg`)

Any of these can be provided at runtime to override the UI config:

```js
msg.folder          = "~/iot-systems/demo01";   // base folder
msg.nodeName        = "node1";                  // subfolder name
msg.port            = "/dev/ttyUSB1";          // or rfc2217://host:port

msg.wifiSSID        = "MyWiFi";
msg.wifiPassword    = "secret123";
msg.mqttHost        = "192.168.14.1";           // optional, defaults to 192.168.14.1

msg.controllerType  = "Wemos D1 Mini";          // board for node.conf

// Sensors 1..3 (type, MQTT channel, pins as CSV), filters as JSON object
msg.sensor1         = "dht";
msg.mqttChannel1    = "kitchen/temperature";
msg.sensor1Pins     = "5";                      // GPIO, one pin for DHT
msg.filter1Type     = "average";
msg.filter1Params   = { buflen: 100 };

msg.sensor2         = "hcsr04";
msg.mqttChannel2    = "kitchen/distance";
msg.sensor2Pins     = "12,13";                  // TRIG,ECHO

msg.sensor3         = "mfrc522";
msg.mqttChannel3    = "kitchen/rfid";
```

---

## Output format

**Success:**

```json
{
  "success": true,
  "output": "[stdout]",
  "port": "/dev/ttyUSB0",
  "method": "usb"  // or "net"
}
```

**Error:**

```json
{
  "success": false,
  "error": "[stderr or error message]"
}
```

---

## Installation

```bash
cd path/to/your/dev/folder

# Clone the repository
git clone https://github.com/fedirky/IoTempire-newNodes.git
cd IoTempire-newNodes/node-red-contrib-flasher

# Install & link the node
npm install
npm link

# Link into your local Node-RED user dir
cd ~/.node-red
npm link node-red-contrib-flasher
```

Restart Node-RED (IoTempower helpers shown here):

```bash
iot exec node-red-stop
iot exec node-red
```

> Make sure the **`iot`** CLI is installed and available in `PATH`.

---

## HTTP admin endpoints (used by the editor UI)

* `GET  /flasher/list-nodes?folder=~/iot-systems/demo` → returns subfolder names
* `POST /flasher/create-node` `{ folder, nodeName }`
* `POST /flasher/rename-node` `{ folder, from, to }`

These power the folder picker and the + / ✏️ buttons in the editor.

---

---

## Flasher — Node Help (Markdown)

**Summary.** Flashes (deploys firmware to) an IoTempower node and prepares its folder structure: creates/renames node subfolders, initializes the system template, updates Wi‑Fi/MQTT settings, generates `setup.cpp` from selected sensors and filters, and executes `iot exec deploy serial` via USB or RFC2217 (“Mango”). The flash command can be defined in the node configuration and/or overridden by an incoming message.

### Inputs
| Property | Type | Required | Description |
|---|---|:--:|---|
| `folder` | string |  | Base folder containing the IoTempower system. Supports `~/` shorthand. |
| `nodeName` | string |  | Name of the node’s subfolder inside `folder`. Used as the flash target. |
| `controllerType` | string |  | Controller type (e.g., `Wemos D1 Mini`, `m5stickc_plus`, `m5stickc_plus2`). Written to `node.conf` and determines available pins. |
| `deployMethod` | string |  | `usb` (default) or `mango` (RFC2217). Defines how `iot exec deploy serial` is called. |
| `port` | string |  | For `usb`: path to the serial port (e.g., `/dev/ttyUSB0`). Ignored for `mango` (uses `rfc2217://192.168.14.1:5000`). |
| `wifiSSID` | string |  | Wi‑Fi SSID. Written to `system.conf`. |
| `wifiPassword` | string |  | Wi‑Fi password. Written to `system.conf`. |
| `mqttHost` | string |  | MQTT broker host (default `192.168.14.1`). Written to `system.conf`. |
| `sensor1`, `sensor2`, `sensor3` | string |  | Sensor codes from `devices.ini` (e.g., `dht22`, `bh1750`). Used to generate device calls in `setup.cpp`. |
| `mqttChannel1`, `mqttChannel2`, `mqttChannel3` | string |  | MQTT channels for sensors (required for most sensors). |
| `sensor1Pins`, `sensor2Pins`, `sensor3Pins` | string |  | Comma‑separated list of pins per sensor/controller (e.g., `D5,D6`). |
| `filter1Type`, `filter2Type`, `filter3Type` | string |  | Filter names (e.g., `average`, `jmc_median`, `binarize` …) applied to each sensor chain. |
| `filter1Params`, `filter2Params`, `filter3Params` | object or JSON string |  | Filter params (e.g., `{"buflen":100}`). |

### Outputs
**Port 1 — Flash result**  
`msg.payload` is an object:
```json
{
  "success": true,
  "output": "...",
  "port": "/dev/ttyUSB0",
  "method": "usb"
}
```
On failure:
```json
{
  "success": false,
  "error": "Detailed error message"
}
```

### Details
- **Folder preparation.** If `system.conf` is missing in `folder`, the node copies templates from `$IOTEMPOWER_ROOT/lib/system_template` (`node_template` + `system.conf`) and creates a `nodeName` subfolder.
- **Configuration update.** Updates `system.conf` keys: `IOTEMPOWER_AP_NAME`, `IOTEMPOWER_AP_PASSWORD`, `IOTEMPOWER_MQTT_HOST`. Regenerates `setup.cpp`. Writes `controllerType` to `node.conf`.
- **Sensors & filters.** Three slots (`1..3`) described by `sensorX` + `mqttChannelX` and optionally `sensorXPins`. Validates required pin count based on sensor type. Each measurement chain can include `filterXType` with `filterXParams`.
- **Deployment.**
  - `usb` — runs `iot exec deploy serial --upload-port "<port>"`. Defaults to `/dev/ttyUSB0` if not set. If an RFC2217 URL is provided in USB mode, the node warns and uses the default port.
  - `mango` — uses `rfc2217://192.168.14.1:5000` and ignores `port`.
- **Node status.** While running — **flashing**, on success — **done**, on error — **red status** with message. PID/process details are not displayed.

### HTTP endpoints (for UI)
Used by the editor to manage node subfolders:
- `GET /flasher/list-nodes?folder=~/iot-systems/demo` — list subfolders
- `POST /flasher/create-node` `{ folder, nodeName }`
- `POST /flasher/rename-node` `{ folder, from, to }`

### Validation & common errors
The node validates:
- Existence/creatability of `folder`.
- Correct `wifiSSID` / `wifiPassword` / `mqttHost` when updating `system.conf`.
- Presence of sensors in `devices.ini`, non‑empty `mqttChannelX`, and sufficient number of pins per sensor.
On failure, returns `payload.success=false` with a descriptive `payload.error`.

### Examples
**USB deploy (default port)**
```json
{
  "folder": "~/iot-systems/demo",
  "nodeName": "kitchen",
  "controllerType": "Wemos D1 Mini",
  "deployMethod": "usb",
  "sensor1": "dht22",
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
  "deployMethod": "mango",
  "wifiSSID": "MyAP",
  "wifiPassword": "secret123",
  "mqttHost": "192.168.14.1"
}
```

### Tips
- Quote parameters that contain spaces.
- Any field configured on the node can be overridden via `msg.*`.
- Ensure unique pin usage across sensors in different slots.

## License

MIT © Fedir Kyrychenko
