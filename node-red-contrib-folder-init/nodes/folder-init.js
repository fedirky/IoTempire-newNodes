const { exec } = require("child_process");
const fs       = require("fs");
const os       = require("os");

module.exports = function(RED) {
  function IoTInitNode(config) {
    RED.nodes.createNode(this, config);
    const baseFolder   = config.folder.replace(/^~\//, os.homedir() + "/");
    const baseNodeName = config.nodeName;
    const baseSSID     = config.wifiSSID;
    const basePass     = config.wifiPassword;

    this.status({ fill:"blue", shape:"dot", text:"ready" });

    this.on("input", (msg) => {
      const folder     = (msg.folder   || baseFolder).replace(/^~\//, os.homedir() + "/");
      const nodeName   = msg.nodeName || baseNodeName;
      const wifiSSID   = msg.wifiSSID || baseSSID;
      const wifiPass   = msg.wifiPassword || basePass;
      const tpl        = `$IOTEMPOWER_ROOT/lib/system_template`;

      // Шлях до system.conf у папці Folder
      const sysConf = `${folder}/system.conf`;

      // Формуємо команду ініціалізації
      const cmd = `
        mkdir -p "${folder}" && \
        if [ ! -f "${sysConf}" ]; then \
          cp -R "${tpl}" "${folder}/init_tmp" && \
          mv "${folder}/init_tmp/node_template" "${folder}/${nodeName}" && \
          mv "${folder}/init_tmp/system.conf" "${sysConf}" && \
          rm -rf "${folder}/init_tmp"; \
        else \
          cp -R "${tpl}/node_template" "${folder}/${nodeName}"; \
        fi
      `;

      this.status({ fill:"yellow", shape:"ring", text:"initializing" });

      exec(cmd, { shell: '/bin/bash' }, (err, stdout, stderr) => {
        if (err) {
          this.status({ fill:"red", shape:"ring", text:"error" });
          msg.payload = { success: false, error: stderr.trim() || err.message };
          this.send(msg);
          this.status({ fill:"blue", shape:"dot", text:"ready" });
          return;
        }

        // Тепер записуємо або оновлюємо WiFi-параметри у system.conf
        try {
          let lines = fs.readFileSync(sysConf, 'utf8')
            // прибираємо старі записи, якщо вони були
            .replace(/^IOTEMPOWER_AP_NAME=.*$/m, '')
            .replace(/^IOTEMPOWER_AP_PASSWORD=.*$/m, '')
            .trim();

          // додаємо нові в кінець
          lines += `\nIOTEMPOWER_AP_NAME="${wifiSSID}"\nIOTEMPOWER_AP_PASSWORD="${wifiPass}"\n`;

          fs.writeFileSync(sysConf, lines, 'utf8');

          this.status({ fill:"green", shape:"dot", text:"done" });
          msg.payload = { success: true, output: stdout.trim() };
        } catch (e) {
          this.status({ fill:"red", shape:"ring", text:"conf error" });
          msg.payload = { success: false, error: 'Config write error: ' + e.message };
        }

        this.send(msg);
        setTimeout(() => this.status({ fill:"blue", shape:"dot", text:"ready" }), 3000);
      });
    });
  }

  RED.nodes.registerType("iot-init", IoTInitNode);
};
