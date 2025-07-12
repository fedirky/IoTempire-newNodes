# node-red-contrib-flasher

A custom Node-RED node that flashes IoT controllers using the `deploy serial` command from IoT Empower. It allows you to specify the target folder containing your node definitions and the serial port to use for uploading.

## Features

* Flash one or more controllers from a specified folder
* Uses `iot exec deploy serial --upload-port <port>` under the hood
* Configurable folder path (defaults to `~/iot-systems/demo01/test01`)
* Configurable serial port (defaults to `/dev/ttyUSB0`)
* Overrides via `msg.folder` and `msg.port` at runtime
* Status indicators in the Node-RED editor

## Installation

1. **Clone or download** this repository to your development machine.

   ```bash
   git clone https://github.com/fedirky/IoTempire-newNodes
   cd node-red-contrib-flasher
   ```

2. **Initialize and link** your package globally:

   ```bash
   npm install
   npm link
   ```

3. **Link into your Node-RED user directory** (`~/.node-red`):

   ```bash
   cd ~/.node-red
   npm link node-red-contrib-flasher
   ```

4. **Restart Node-RED** so it picks up the new node:

   ```bash
   iot exec node-red-stop
   iot exec node-red
   ```

## Configuration

After restarting, the **flasher** node will appear in the **network** category. Drag it onto your flow and double-click to open its settings:

* **Name** – an optional label for the node
* **Folder** – path to the folder containing your node definitions (default: `~/iot-systems/demo01/test01`)
* **Serial Port** – the device to use for flashing (default: `/dev/ttyUSB0`)


## Usage Example

1. Add an **Inject** node and configure it to send an empty payload.
2. Wire it into the **Flasher** node.
3. Wire the Flasher node into a **Debug** node.
4. Deploy your flow and trigger the inject.
5. Observe the flashing progress via the node’s status and the debug output:

```json
// On success:
{
  "success": true,
  "output": "Flashing done: [output from deploy CLI]"
}

// On failure:
{
  "success": false,
  "error": "[error message from CLI]"
}
```

## Notes

* The Flasher node runs:

  ```bash
  cd <configured-folder> && iot exec deploy serial --upload-port <configured-port>
  ```

  under the hood, ensuring that the `deploy` utility runs from within the target node directory.
* Make sure the `iot` CLI and `deploy` command are available in your environment and properly configured (e.g. `system.conf` in IoT Empower).

## License

MIT © Fedir Kyrychenko
