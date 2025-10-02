const { exec, execSync } = require("child_process");
const os = require("os");
const path = require("path");
const fs = require("fs");

module.exports = function(RED) {
  // --- HTTP Admin endpoints for editor UI (list/create node folders) ---
  RED.httpAdmin.get("/flasher/list-nodes", function(req, res) {
    try {
      let folder = req.query.folder || "";
      folder = folder.replace(/^~\//, os.homedir() + "/");
      const dirs = fs.readdirSync(folder, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
      res.json(dirs);
    } catch (e) {
      res.status(500).send(e.message || "Failed to list nodes");
    }
  });

  // Створити підпапку
  RED.httpAdmin.post("/flasher/create-node", function(req, res) {
    try {
      let folder = (req.body && req.body.folder) || "";
      let nodeName = (req.body && req.body.nodeName) || "";
      folder = folder.replace(/^~\//, os.homedir() + "/");
      nodeName = String(nodeName).trim();
      if (!folder) return res.status(400).send("Missing 'folder'");
      if (!nodeName) return res.status(400).send("Missing 'nodeName'");
      if (!/^[a-zA-Z0-9._-]{1,64}$/.test(nodeName)) {
        return res.status(400).send("Invalid node name");
      }
      fs.mkdirSync(path.join(folder, nodeName), { recursive: true });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).send(e.message || "Failed to create node");
    }
  });

  // Перейменувати підпапку
  RED.httpAdmin.post("/flasher/rename-node", function(req, res) {
    try {
      let folder = (req.body && req.body.folder) || "";
      let from   = (req.body && req.body.from)   || "";
      let to     = (req.body && req.body.to)     || "";
      folder = folder.replace(/^~\//, os.homedir() + "/");
      from = String(from).trim();
      to   = String(to).trim();
      if (!folder || !from || !to) return res.status(400).send("Missing params");
      if (!/^[a-zA-Z0-9._-]{1,64}$/.test(to)) {
        return res.status(400).send("Invalid name");
      }
      fs.renameSync(path.join(folder, from), path.join(folder, to));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).send(e.message || "Failed to rename node");
    }
  });

  // ---- Config node: flasher-folder ----
  function FlasherFolder(n) {
    RED.nodes.createNode(this, n);
    this.name     = n.name;
    this.path     = n.path || os.homedir() + "/iot-systems/demo";
    this.nodeName = n.nodeName || "test01";
    this.wifiSSID = n.wifiSSID || "";
    this.wifiPassword = n.wifiPassword || "";
    this.mqttHost = n.mqttHost || "";
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
    const deployMethod   = config.deployMethod || "usb";
    const port           = config.port;
    const controllerType = config.controllerType;
    

    // ---- Build filter ----
    const q = (s, def) => JSON.stringify(s != null && s !== "" ? s : def);
    const n = (v, def) => {
      if (v == null || v === "") return Number(def);
      if (typeof v === "string") v = v.trim().replace(",", ".");
      const num = Number(v);
      return isNaN(num) ? Number(def) : num;
    };

    function buildFilterSuffix(type, params = {}) {
      switch ((type || "").trim()) {
        case "average":
          return `.filter_average(${n(params.buflen, 100)})`;
        case "jmc_median":
          return `.filter_jmc_median()`;
        case "jmc_interval_median": {
          // якщо задано reset_each_ms – використовуємо його, інакше update_ms
          if (params.reset_each_ms) {
            return `.filter_jmc_interval_median(${n(params.reset_each_ms, 500)})`;
          }
          return `.filter_jmc_interval_median(${n(params.update_ms, 500)})`;
        }
        case "minchange":
          return `.filter_minchange(${n(params.minchange, 0.1)})`;
        case "binarize":
          return `.filter_binarize(${n(params.cutoff, 0.5)}, ${q(params.high, "on")}, ${q(params.low, "off")})`;
        case "round":
          return `.filter_round(${n(params.base, 1)})`;
        case "limit_time":
          return `.filter_limit_time(${n(params.interval, 500)})`;
        case "detect_click": {
          // Будуємо список тільки з заповнених аргументів
          const args = [];
          ["click_min_ms","click_max_ms","longclick_min_ms","longclick_max_ms"].forEach(k=>{
            if (params[k] !== "" && params[k] != null) args.push(n(params[k]));
          });
          if (params.pressed_str !== "" && params.pressed_str != null)  args.push(q(params.pressed_str));
          if (params.released_str !== "" && params.released_str != null) args.push(q(params.released_str));
          return `.filter_detect_click(${args.join(", ")})`;
        }
        case "interval_map": {
          // pairs — це сирий CSV (наприклад: "low",-0.5,, ,0.5,"high")
          const raw = (params.pairs || "").trim();
          return raw ? `.filter_interval_map(${raw})` : ``;
        }
        default:
          return ``;
      }
    }

    node.status({ fill: "blue", shape: "dot", text: "ready" });

    // допоміжна функція — зібрати команду прошивки залежно від методу
    function buildDeployCommand(method, port, targetFolder) {
      const m = String(method || "usb").toLowerCase();
      let via, cmd, warn = null;

      if (m === "mango") {
        // ІГНОРУЄМО будь-який port; команда завжди однакова
        via = "Mango";
        const p = "rfc2217://192.168.14.1:5000";
        cmd = `cd "${targetFolder}" && iot exec deploy serial ${p}`;
        return { cmd, finalPort: p, via, warn };
      }

      // USB-гілка
      via = "USB";
      let p = port;
      if (!p || /^rfc2217:\/\//.test(p)) {
        if (/^rfc2217:\/\//.test(p)) {
          warn = `USB mode обрано, але порт має вигляд RFC2217 (${p}). Використовую /dev/ttyUSB0.`;
        }
        p = "/dev/ttyUSB0";
      }
      cmd = `cd "${targetFolder}" && iot exec deploy serial --upload-port "${p}"`;
      return { cmd, finalPort: p, via, warn };
    }

    // ======== увесь модуль обробки повідомлення ========
    node.on("input", function(msg) {
      node.warn(`[flasher:input] msg.deployMethod=${msg.deployMethod} | config.deployMethod=${config.deployMethod}`);


      // Override with msg values if provided
      const folder           = (msg.folder   || baseFolder).replace(/^~\//, os.homedir() + "/");
      const nodeName         = msg.nodeName || baseNode;
      const chosenController = msg.controllerType || controllerType;

      // === deploy method + port ===
      const method = String(msg.deployMethod || config.deployMethod || "usb").toLowerCase();
      let finalPortInput = msg.port || config.port || "";

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
        try {
          execSync(`cp -R "${tplRoot}/node_template" "${targetFolder}"`, {shell:'/bin/bash'});
        } catch (err) {
          node.error(`Node folder copy error: ${err.message}`);
          node.status({ fill: "red", shape: "ring", text: "copy error" });
          return;
        }
      }

      // Update WiFi credentials and MQTT host in system.conf
      try {
        let data = fs.readFileSync(sysConf, 'utf8')
          .replace(/^IOTEMPOWER_AP_NAME=.*$/m, '')
          .replace(/^IOTEMPOWER_AP_PASSWORD=.*$/m, '')
          .replace(/^IOTEMPOWER_MQTT_HOST=.*$/m, '')
          .trim();

        const wifiSSID = msg.wifiSSID || folderConfig.wifiSSID;
        const wifiPass = msg.wifiPassword || folderConfig.wifiPassword;
        const mqttHost = msg.mqttHost || folderConfig.mqttHost || "192.168.14.1"; // <-- нове поле

        data += `
IOTEMPOWER_AP_NAME="${wifiSSID}"
IOTEMPOWER_AP_PASSWORD="${wifiPass}"
IOTEMPOWER_MQTT_HOST="${mqttHost}"
`;

        fs.writeFileSync(sysConf, data, 'utf8');
        node.log('Updated WiFi credentials and MQTT host in system.conf');
      } catch (err) {
        node.error(`WiFi/MQTT config error: ${err.message}`);
        node.status({ fill: "red", shape: "ring", text: "wifi/mqtt config error" });
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

      // ---- Sensors ----
      const validSensors = ["dht", "mfrc522", "hcsr04"];
      const sensors = [1, 2, 3].map(i => ({
        type:   msg[`sensor${i}`]        || config[`sensor${i}`]        || "",
        channel:msg[`mqttChannel${i}`]   || config[`mqttChannel${i}`]   || "",
        pins:  (msg[`sensor${i}Pins`]    || config[`sensor${i}Pins`]    || "")
                .split(/\s*,\s*/).filter(Boolean),
        filterType:  msg[`filter${i}Type`]  || config[`filter${i}Type`]  || "",
        filterParams:(() => {
          const raw = msg[`filter${i}Params`] || config[`filter${i}Params`] || "{}";
          try { return typeof raw === "string" ? JSON.parse(raw) : (raw || {}); }
          catch { return {}; }
        })()
      }));

      const REQUIRED_PINS = { dht: 1, hcsr04: 2, mfrc522: 0 };
      let validationErrors = [];
      sensors.forEach((s, idx) => {
        if (!s.type) return;
        if (!validSensors.includes(s.type)) {
          validationErrors.push(`Sensor ${idx+1}: unsupported type "${s.type}".`);
          return;
        }
        if (!s.channel || !String(s.channel).trim()) {
          validationErrors.push(`Sensor ${idx+1} (${s.type}) requires an MQTT channel.`);
        }
        const need = REQUIRED_PINS[s.type] ?? 0;
        if (need > 0 && s.pins.length < need) {
          validationErrors.push(`Sensor ${idx+1} (${s.type}) requires ${need} pin(s), got ${s.pins.length}.`);
        }
      });
      if (validationErrors.length) {
        const errMsg = `Validation failed:\n- ` + validationErrors.join("\n- ");
        node.status({ fill: "red", shape: "ring", text: "validation error" });
        node.error(errMsg);
        msg.payload = { success: false, error: errMsg };
        node.send(msg);
        return;
      }

      function buildDeviceCall(s) {
        switch (s.type) {
          case "dht":
            return `dht(${s.channel}, ${s.pins[0]})`;
          case "mfrc522":
            return `mfrc522(${s.channel}, 32)`;
          case "hcsr04":
            return `hcsr04(${s.channel}, ${s.pins[0]}, ${s.pins[1]}).with_precision(10)`;
          case "bmp085":
            return `bmp085(${s.channel}).i2c(${s.pins[0]}, ${s.pins[1]})`;
          case "bmp180":
            return `bmp180(${s.channel}).i2c(${s.pins[0]}, ${s.pins[1]})`;
          case "bmp280":
            return `bmp280(${s.channel}).i2c(${s.pins[0]}, ${s.pins[1]})`;
          case "button":
            return `input(${s.channel}, ${s.pins[0]}, "depressed", "pressed").with_debounce(5)`;
          case "display":
            return `display(${s.channel}).i2c(${s.pins[0]}, ${s.pins[1]})`;
          case "display44780":
            return `display44780(${s.channel}, 16, 2).i2c(${s.pins[0]}, ${s.pins[1]})`;
          case "gyro6050":
            return `gyro6050(${s.channel}).i2c(${s.pins[0]}, ${s.pins[1]})`;
          case "gyro9250":
            return `gyro9250(${s.channel}).i2c(${s.pins[0]}, ${s.pins[1]})`;
          case "hx711":
            return `hx711(${s.channel}, ${s.pins[0]}, ${s.pins[1]}, 450, false)`;
          case "output":
            return `output(${s.channel}, ${s.pins[0]}, "on", "off")`;
          case "mpr121":
            return `mpr121(${s.channel}).i2c(${s.pins[0]}, ${s.pins[1]})`;
          case "pwm":
            return `pwm(${s.channel}, ${s.pins[0]}, 1000)`; 
          case "rgb_strip_grb":
            return `rgb_strip_bus(${s.channel}, ${s.num_leds}, F_GRB, NeoEsp8266Uart1800KbpsMethod, ${s.pins[0]})`;
          case "rgb_strip_brg":
            return `rgb_strip_bus(${s.channel}, ${s.num_leds}, F_BRG, NeoEsp8266Uart1800KbpsMethod, ${s.pins[0]})`;
          case "rgb_single":
            return `rgb_single(${s.channel}, ${s.pins[0]}, ${s.pins[1]}, ${s.pins[2]}, false)`;
          case "rgb_single_inverted":
            return `rgb_single(${s.channel}, ${s.pins[0]}, ${s.pins[1]}, ${s.pins[2]}, true)`;
          case "servo":
            return `servo(${s.channel}, ${s.pins[0]}, 600, 2400, 700)`;
          case "servo_switch":
            return `servo_switch(${s.channel}, ${s.pins[0]}, 0, 180, 90, "on", "off", 700, 600, 2400)`;

          default:       return "";
        }
      }

      sensors.forEach((s, idx) => {
        if (!s.type || !validSensors.includes(s.type)) return;
        const baseCall = buildDeviceCall(s);
        if (!baseCall) return;
        const suffix = buildFilterSuffix(s.filterType, s.filterParams);
        const line = baseCall + (suffix || "") + ";";
        fs.appendFileSync(setupFile, line + "\n");
        node.log(`Added setup code [S${idx+1}]: ${line}`);
      });

      // === сформувати команду прошивки через утиліту ===
      const { cmd, finalPort, via, warn } = buildDeployCommand(method, finalPortInput, targetFolder);
      if (warn) node.warn(warn);

      node.status({ fill: "yellow", shape: "ring", text: `flashing ${nodeName} via ${via}` });

      exec(cmd, (err, stdout, stderr) => {
        if (err) {
          node.status({ fill: "red", shape: "ring", text: "error" });
          msg.payload = { success: false, error: stderr && stderr.trim() ? stderr.trim() : err.message };
        } else {
          node.status({ fill: "green", shape: "dot", text: "done" });
          msg.payload = { success: true, output: stdout.trim(), port: finalPort, method: via.toLowerCase() };
        }
        node.send(msg);
        setTimeout(() => node.status({}), 5000);
      });
    });
  }

  RED.nodes.registerType("flasher", FlasherNode);
};

