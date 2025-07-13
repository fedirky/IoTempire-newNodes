const { exec } = require("child_process");
const os = require("os");
const path = require("path");

module.exports = function(RED) {
  function FlasherNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // Розгортаємо ~/ → абсолютний шлях
    const baseFolder = config.folder.replace(/^~\//, os.homedir() + "/");
    const baseNode   = config.nodeName;
    const port       = config.port;

    node.status({ fill:"blue", shape:"dot", text:"ready" });

    node.on("input", function(msg) {
      // Переоприділення через msg
      const folder   = msg.folder   || baseFolder;
      const nodeName = msg.nodeName || baseNode;
      const uploadPort = msg.port   || port;

      // Повний шлях до папки ноди
      const targetFolder = path.join(folder, nodeName);

      // Команда: спочатку cd у папку ноди, потім deploy
      const cmd = `cd ${targetFolder} && iot exec deploy serial --upload-port ${uploadPort}`;

      node.status({ fill:"yellow", shape:"ring", text:`flashing ${nodeName}` });

      exec(cmd, (err, stdout, stderr) => {
        if (err) {
          node.status({ fill:"red", shape:"ring", text:"error" });
          msg.payload = { success:false, error: stderr.trim()||err.message };
        } else {
          node.status({ fill:"green", shape:"dot", text:"done" });
          msg.payload = { success:true, output: stdout.trim() };
        }
        node.send(msg);
        setTimeout(()=>node.status({}), 5000);
      });
    });
  }

  RED.nodes.registerType("flasher", FlasherNode);
}
