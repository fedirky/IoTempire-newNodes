const { exec } = require("child_process");
const os = require("os");
const path = require("path");
const fs = require("fs");

module.exports = function(RED) {
  // ---- Config node: flasher-folder ----
  function FlasherFolder(n) {
    RED.nodes.createNode(this, n);
    this.name     = n.name;
    this.path     = n.path || os.homedir() + "/iot-systems/demo";
    this.nodeName = n.nodeName || "test01";
    this.wifiSSID = n.wifiSSID || "";
    this.wifiPassword = this.credentials && this.credentials.wifiPassword || "";
  }
  RED.nodes.registerType("flasher-folder", FlasherFolder, {
    credentials: {
      wifiPassword: { type: "password" }
    }
  });

  // ---- Main node: flasher ----
  function FlasherNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // Retrieve config-node instance
    const folderConfig = RED.nodes.getNode(config.folder) || {};

    // Expand ~/ to absolute path
    const baseFolder     = (folderConfig.path || config.folder || "~/iot-systems/demo").replace(/^~\//, os.homedir() + "/");
    const baseNode       = folderConfig.nodeName || config.nodeName;
    const port           = folderConfig.port || config.port;
    const sensor         = config.sensor;
    const mqttChannel    = config.mqttChannel;
    const controllerType = config.controllerType;

    node.status({ fill: "blue", shape: "dot", text: "ready" });

    node.on("input", function(msg) {
      // Override via msg if provided
      const folder            = msg.folder   || baseFolder;
      const nodeName          = msg.nodeName || baseNode;
      const uploadPort        = msg.port     || port;
      const chosenSensor      = msg.sensor   || sensor;
      const chosenMqttChannel = msg.mqttChannel || mqttChannel;
      const chosenController  = msg.controllerType || controllerType;

      // Validate sensor selection
      const validSensors = ["dht", "mfrc522", "hcsr04"];
      if (!validSensors.includes(chosenSensor)) {
        node.error(`Invalid sensor type: ${chosenSensor}`);
        node.status({ fill: "red", shape: "ring", text: "invalid sensor" });
        return;
      }

      // Full path to node folder
      const targetFolder = path.join(folder, nodeName);
      const setupFile    = path.join(targetFolder, 'setup.cpp');
      const confFile     = path.join(targetFolder, 'node.conf');

      // Clear or create new setup.cpp
      try {
        fs.writeFileSync(setupFile, '');
        node.log(`Cleared setup.cpp for sensor: ${chosenSensor}`);
      } catch (err) {
        node.error(`Failed to clear setup.cpp: ${err.message}`);
        node.status({ fill: "red", shape: "ring", text: "file error" });
        return;
      }

      // Write node.conf with controllerType
      try {
        fs.writeFileSync(confFile, `board="${chosenController}"\n`);
        node.log(`Wrote node.conf with board="${chosenController}"`);
      } catch (err) {
        node.error(`Failed to write node.conf: ${err.message}`);
        node.status({ fill: "red", shape: "ring", text: "config error" });
        return;
      }

      // Generate code based on sensor
      let setupCode = '';
      switch (chosenSensor) {
        case 'dht':
          setupCode = `dht(${chosenMqttChannel}, D1);`;
          break;
        case 'mfrc522':
          setupCode = `mfrc522(${chosenMqttChannel}, 32);`;
          break;
        case 'hcsr04':
          setupCode = `hcsr04(${chosenMqttChannel}, D5, D6).with_precision(10);`;
          break;
      }

      // Write new code to setup.cpp
      try {
        fs.appendFileSync(setupFile, `${setupCode}\n`);
        node.log(`Added setup code for sensor: ${chosenSensor}`);
      } catch (err) {
        node.error(`Failed to write setup.cpp: ${err.message}`);
        node.status({ fill: "red", shape: "ring", text: "write error" });
        return;
      }

      // Deploy command
      const cmd = `cd ${targetFolder} && iot exec deploy serial --upload-port ${uploadPort}`;
      node.status({ fill: "yellow", shape: "ring", text: `flashing ${nodeName}` });

      exec(cmd, (err, stdout, stderr) => {
        if (err) {
          node.status({ fill: "red", shape: "ring", text: "error" });
          msg.payload = { success: false, error: stderr.trim() || err.message };
        } else {
          node.status({ fill: "green", shape: "dot", text: "done" });
          msg.payload = { success: true, output: stdout.trim() };
        }
        node.send(msg);
        setTimeout(() => node.status({}), 5000);
      });
    });
  }

  RED.nodes.registerType("flasher", FlasherNode);
};
