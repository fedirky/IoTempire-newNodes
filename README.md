# node-red-contrib-flasher & node-red-contrib-folder-init

This repository includes **two custom Node-RED nodes** designed to work with IoT Empower:

- `node-red-contrib-flasher`: flashes a selected node over serial using `iot exec deploy serial`
- `node-red-contrib-folder-init`: initializes a node folder and sets up WiFi credentials

## Features

### node-red-contrib-flasher
* Flashes a specific node using `iot exec deploy serial --upload-port`
* Configurable folder, node name, and serial port
* Can be overridden dynamically via `msg.folder`, `msg.nodeName`, `msg.port`

### node-red-contrib-folder-init
* Initializes a system folder structure and node template
* Automatically copies default `system.conf` if missing
* Configures WiFi SSID and password in `system.conf`
* Can be overridden dynamically via `msg.folder`, `msg.nodeName`, `msg.wifiSSID`, `msg.wifiPassword`

## Installation

To install **both extensions at once**, use:

```bash
cd path/to/your/dev/folder

# Clone the repository (or copy the subfolders manually)
git clone https://github.com/fedirky/IoTempire-newNodes
cd IoTempire-newNodes

# Install dependencies and link each extension separately
cd node-red-contrib-flasher
npm install
npm link

cd ../node-red-contrib-folder-init
npm install
npm link

# Go to your local Node-RED user directory
cd ~/.node-red

# Link both extensions into Node-RED
npm link node-red-contrib-flasher node-red-contrib-folder-init
```

Then restart Node-RED:

```bash
iot exec node-red-stop
iot exec node-red
```

## Node Configuration

### Flasher Node (`flasher`)
- **Folder**: Base path to the node (e.g. `~/iot-systems/demo01`)
- **Node Name**: The specific node folder (e.g. `test01`)
- **Port**: Serial port used to flash (e.g. `/dev/ttyUSB0`)

Runtime override with:
```js
msg.folder = "~/iot-systems/demo01";
msg.nodeName = "node1";
msg.port = "/dev/ttyUSB1";
```

### Folder Init Node (`iot-init`)
- **Folder**: Where to create the system and node structure
- **Node Name**: Folder name for the new node
- **WiFi SSID / Password**: Credentials to write into `system.conf`

Runtime override with:
```js
msg.folder = "~/iot-systems/demo02";
msg.nodeName = "node2";
msg.wifiSSID = "MyWiFi";
msg.wifiPassword = "secret123";
```

## Output Format

Both nodes return messages in the following format:

```json
{
  "success": true,
  "output": "[stdout or status message]"
}
```

On error:

```json
{
  "success": false,
  "error": "[stderr or error message]"
}
```

## License

MIT © Fedir Kyrychenko
