const { exec, execSync } = require("child_process");
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
    this.wifiPassword = n.wifiPassword || "";
  }
  RED.nodes.registerType("flasher-folder", FlasherFolder);

  // ---- Main node: flasher ----
  function FlasherNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // Retrieve config-node instance
    const folderConfig = RED.nodes.getNode(config.folder) || {};

    // Base parameters
    const baseFolder     = (folderConfig.path || config.folder || "~/iot-systems/demo").replace(/^~\//, os.homedir() + "/");
    const baseNode       = folderConfig.nodeName || config.nodeName;
    const port           = folderConfig.port || config.port;
    const sensor         = config.sensor;
    const mqttChannel    = config.mqttChannel;
    const controllerType = config.controllerType;

    node.status({ fill: "blue", shape: "dot", text: "ready" });

    node.on("input", function(msg) {
      // Override via msg if provided
      const folder            = (msg.folder   || baseFolder).replace(/^~\//, os.homedir() + "/");
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

      // Paths
      const tplRoot      = "$IOTEMPOWER_ROOT/lib/system_template";
      const sysConf      = path.join(folder, 'system.conf');
      const targetFolder = path.join(folder, nodeName);
      const setupFile    = path.join(targetFolder, 'setup.cpp');
      const confFile     = path.join(targetFolder, 'node.conf');

      // Ensure base folder exists
      try {
        fs.mkdirSync(folder, { recursive: true });
      } catch (err) {
        node.error(`Failed to create base folder: ${err.message}`);
        node.status({ fill: "red", shape: "ring", text: "folder error" });
        return;
      }

      // Initialize system template if missing
      if (!fs.existsSync(sysConf)) {
        const tmp = path.join(folder, 'init_tmp');
        try {
          fs.mkdirSync(tmp, { recursive: true });
          execSync(`cp -R "${tplRoot}/node_template" "${tmp}/node_template"`, {shell:'/bin/bash'});
          execSync(`cp "${tplRoot}/system.conf" "${tmp}/system.conf"`, {shell:'/bin/bash'});
          fs.mkdirSync(targetFolder, { recursive: true });
          fs.renameSync(path.join(tmp, 'node_template'), targetFolder);
          fs.renameSync(path.join(tmp, 'system.conf'), sysConf);
          fs.rmdirSync(tmp, { recursive: true });
        } catch (err) {
          node.error(`Template init error: ${err.message}`);
          node.status({ fill: "red", shape: "ring", text: "init error" });
          return;
        }
      } else if (!fs.existsSync(targetFolder)) {
        // only copy node_template for missing node folder
        try {
          exec(`cp -R "${tplRoot}/node_template" "${targetFolder}"`, {shell:'/bin/bash'});
        } catch (err) {
          node.error(`Node folder copy error: ${err.message}`);
          node.status({ fill: "red", shape: "ring", text: "copy error" });
          return;
        }
      }

      // Update WiFi credentials in system.conf
      try {
        let data = fs.readFileSync(sysConf, 'utf8')
          .replace(/^IOTEMPOWER_AP_NAME=.*$/m, '')
          .replace(/^IOTEMPOWER_AP_PASSWORD=.*$/m, '')
          .trim();
        const wifiSSID = msg.wifiSSID || folderConfig.wifiSSID || config.wifiSSID || '';
        const wifiPass = msg.wifiPassword || folderConfig.wifiPassword || config.wifiPassword || '';
        data += `
IOTEMPOWER_AP_NAME="${wifiSSID}"
IOTEMPOWER_AP_PASSWORD="${wifiPass}"
`;
        fs.writeFileSync(sysConf, data, 'utf8');
        node.log('Updated WiFi credentials in system.conf');
      } catch (err) {
        node.error(`WiFi config error: ${err.message}`);
        node.status({ fill: "red", shape: "ring", text: "wifi config error" });
        return;
      }

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
