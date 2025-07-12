const { exec } = require("child_process");
const os = require("os");
const path = require("path");

module.exports = function(RED) {
  function FlasherNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    // за замовчуванням
    const folder = config.folder.replace(/^~\//, os.homedir() + "/");
    const port   = config.port;

    node.status({ fill:"blue", shape:"dot", text:`ready` });

    node.on("input", function(msg) {
      const targetFolder = msg.folder || folder;    // ~/iot-systems/demo01/test01
      const uploadPort   = msg.port   || port;      // /dev/ttyUSB0

      // Явно переходимо в папку вузла і тільки потім запускаємо deploy
      const cmd = `cd ${targetFolder} && iot exec deploy serial --upload-port ${uploadPort}`;

      node.status({ fill:"yellow", shape:"ring", text:"flashing..." });

      exec(cmd, (err, stdout, stderr) => {
        if (err) {
          node.status({ fill:"red", shape:"ring", text:"error" });
          msg.payload = { success:false, error: stderr.trim() || err.message };
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
