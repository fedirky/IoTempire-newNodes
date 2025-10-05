const { exec, execSync } = require("child_process");
const os = require("os");
const path = require("path");
const fs = require("fs");

// ==== Load devices spec from resources/resourses editor/devices.ini ====
const DEVICES_INI_PATHS = [
  path.resolve(__dirname, '..', 'resources', 'editor', 'devices.ini'),
  path.resolve(__dirname, '..', 'resourses', 'editor', 'devices.ini') // fallback на опечатку
];

function readDevicesIniText() {
  for (const p of DEVICES_INI_PATHS) {
    try {
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
    } catch (_) {}
  }
  throw new Error('devices.ini not found in resources/resourses/editor');
}

function parseDevicesIni(text) {
  const lines = String(text).split(/\r?\n/);
  const sections = {};
  let cur = null;

  for (let raw of lines) {
    // strip ini-style comments starting with ';' (also handles inline comments)
    let line = raw;
    const c = line.indexOf(';');
    if (c !== -1) line = line.slice(0, c);
    line = line.trim();
    if (!line) continue;

    const mSec = line.match(/^\[([^\]]+)\]$/);
    if (mSec) {
      cur = sections[mSec[1].trim()] = { __name: mSec[1].trim() };
      continue;
    }
    if (!cur) continue;

    const mKV = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (mKV) {
      const key = mKV[1].toLowerCase();
      const val = mKV[2].trim();
      cur[key] = val; // keep raw (we’ll split pins/aliases later)
    }
  }

  // Build spec only for sections with a label
  const spec = {};
  const escapeRE = s => s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

  Object.keys(sections).forEach((name) => {
    const sec = sections[name];
    if (!sec.label) return;

    const pins = (sec.pins || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const entry = {
      key: name,
      label: sec.label,
      pins,
      start: sec.start || "",
      // keep raw aliases for later expansion
      _aliases: (sec.aliases || "").split(/[\s,]+/).map(a => a.trim()).filter(Boolean)
    };

    spec[name] = entry;

    // expand aliases as separate keys pointing to same entry (shallow copy)
    entry._aliases.forEach(al => {
      if (!spec[al]) spec[al] = { ...entry, key: al };
    });
  });

  return spec;
}

let DEVICE_SPEC;
try {
  DEVICE_SPEC = parseDevicesIni(readDevicesIniText());
} catch (e) {
  DEVICE_SPEC = {}; // fail-safe
  console.error('[flasher] Failed to load devices.ini:', e.message);
}

// Helpers built from ini
const validSensors = Object.keys(DEVICE_SPEC);
const REQUIRED_PINS = Object.fromEntries(
  validSensors.map(k => [k, (DEVICE_SPEC[k].pins || []).length])
);

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
      // derived from devices.ini (only sections with label, aliases expanded)
      const validSensors = Object.keys(DEVICE_SPEC);

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

      // required pin count per device — from `pins = ...` in devices.ini
      const REQUIRED_PINS = Object.fromEntries(
        validSensors.map(k => [k, (DEVICE_SPEC[k].pins || []).length])
      );

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
        const spec = DEVICE_SPEC[s.type];
        if (!spec) return "";

        let code = spec.start || "";
        if (!code) return "";

        code = code.replace(/\bname\b/g, String(s.channel || 'name'));

        if (/\bnum_leds\b/.test(code) && s.num_leds != null && s.num_leds !== "") {
          code = code.replace(/\bnum_leds\b/g, String(s.num_leds));
        }

        (spec.pins || []).forEach((pinName, idx) => {
          const re = new RegExp(`\\b${pinName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'g');
          const val = (s.pins && s.pins[idx] != null) ? s.pins[idx] : pinName;
          code = code.replace(re, String(val));
        });

        return code;
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

