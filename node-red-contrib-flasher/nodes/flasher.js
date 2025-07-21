const { exec } = require("child_process");
const os = require("os");
const path = require("path");
const fs = require("fs");

module.exports = function(RED) {
  function FlasherNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // Expand ~/ to absolute path
    const baseFolder = config.folder.replace(/^~\//, os.homedir() + "/");
    const baseNode   = config.nodeName;
    const port       = config.port;
    const sensor     = config.sensor;

    node.status({ fill: "blue", shape: "dot", text: "ready" });

    node.on("input", function(msg) {
      // Override via msg if provided
      const folder       = msg.folder   || baseFolder;
      const nodeName     = msg.nodeName || baseNode;
      const uploadPort   = msg.port     || port;
      const chosenSensor = msg.sensor   || sensor;

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

      // Clear or create new setup.cpp
      try {
        fs.writeFileSync(setupFile, '');
        node.log(`Cleared setup.cpp for sensor: ${chosenSensor}`);
      } catch (err) {
        node.error(`Failed to clear setup.cpp: ${err.message}`);
        node.status({ fill: "red", shape: "ring", text: "file error" });
        return;
      }

      // Generate code based on sensor
      let setupCode = '';
      switch (chosenSensor) {
        case 'dht':
          setupCode = 'dht("ht01", D1);';
          break;
        case 'mfrc522':
          setupCode = 'mfrc522(rfid1, 32);';
          break;
        case 'hcsr04':
          setupCode = 'hcsr04(distance, D5, D6).with_precision(10);';
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
