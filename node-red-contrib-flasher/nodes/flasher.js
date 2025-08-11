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

    // Base parameters from config
    const baseFolder     = (folderConfig.path || "~/iot-systems/demo").replace(/^~\//, os.homedir() + "/");
    const baseNode       = config.nodeName;
    const port           = config.port;
    const controllerType = config.controllerType;

    node.status({ fill: "blue", shape: "dot", text: "ready" });

    node.on("input", function(msg) {
      // Override with msg values if provided
      const folder           = (msg.folder   || baseFolder).replace(/^~\//, os.homedir() + "/");
      const nodeName         = msg.nodeName || baseNode;
      const uploadPort       = msg.port     || port;
      const chosenController = msg.controllerType || controllerType;

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
        // Copy node template if node folder is missing
        try {
          execSync(`cp -R "${tplRoot}/node_template" "${targetFolder}"`, {shell:'/bin/bash'});
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
        node.log(`Cleared setup.cpp`);
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

      // ---- NEW LOGIC: Handle three sensors with MQTT + pins ----
      const validSensors = ["dht", "mfrc522", "hcsr04"];

      // Collect sensor configurations
      const sensors = [1, 2, 3].map(i => ({
        type: msg[`sensor${i}`] || config[`sensor${i}`] || "",
        channel: msg[`mqttChannel${i}`] || config[`mqttChannel${i}`] || "",
        pins: (msg[`sensor${i}Pins`] || config[`sensor${i}Pins`] || "")
                .split(/\s*,\s*/).filter(Boolean) // split by comma & trim
      }));
      // ---- VALIDATE AFTER sensors IS INITIALIZED ----
      const REQUIRED_PINS = { dht: 1, hcsr04: 2, mfrc522: 0 };

      let validationErrors = [];

      // Validate each configured sensor
      sensors.forEach((s, idx) => {
        if (!s.type) return; // empty slot is fine
        if (!validSensors.includes(s.type)) {
          validationErrors.push(`Sensor ${idx+1}: unsupported type "${s.type}".`);
          return;
        }
        // MQTT channel is required for any sensor
        if (!s.channel || !String(s.channel).trim()) {
          validationErrors.push(`Sensor ${idx+1} (${s.type}) requires an MQTT channel.`);
        }
        // Enforce required pin count for sensors that need manual pins
        const need = REQUIRED_PINS[s.type] ?? 0;
        if (need > 0 && s.pins.length < need) {
          validationErrors.push(`Sensor ${idx+1} (${s.type}) requires ${need} pin(s), got ${s.pins.length}.`);
        }
      });

      // Stop if validation failed
      if (validationErrors.length) {
        const errMsg = `Validation failed:\n- ` + validationErrors.join("\n- ");
        node.status({ fill: "red", shape: "ring", text: "validation error" });
        node.error(errMsg);
        msg.payload = { success: false, error: errMsg };
        node.send(msg);
        return;
      }

      // Helper to build setup.cpp code for each sensor
      function buildSetupCode(s) {
        switch (s.type) {
          case "dht":
            // Expect 1 pin
            return `dht(${s.channel}, ${s.pins[0]});`;
          case "mfrc522":
            // Fixed pin mapping (RFID reader)
            return `mfrc522(${s.channel}, 32);`;
          case "hcsr04":
            // Expect 2 pins
            return `hcsr04(${s.channel}, ${s.pins[0]}, ${s.pins[1]}).with_precision(10);`;
          default:
            return "";
        }
      }

      // Validate sensors and append setup code
      sensors.forEach(s => {
        if (s.type && validSensors.includes(s.type)) {
          const code = buildSetupCode(s);
          if (code) {
            fs.appendFileSync(setupFile, code + "\n");
            node.log(`Added setup code: ${code}`);
          }
        }
      });

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
