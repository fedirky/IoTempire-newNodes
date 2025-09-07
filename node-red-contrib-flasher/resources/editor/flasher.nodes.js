// resources/editor/flasher.nodes.js
// Підтягує підпапки з вибраної кореневої папки у <select id="node-input-nodeName">,
// та обробляє кнопки + (create) і ✏️ (rename).

(function () {

  function getFolderPathFromConfigPicker() {
    // #node-input-folder — це селектор CONFIG-ноди (ID). Витягнемо реальний шлях.
    var cfgId = $("#node-input-folder").val();
    if (!cfgId) return null;
    var cfg = RED.nodes.node(cfgId);
    return (cfg && cfg.path) ? cfg.path : null;
  }

  function listFsNodes(folderPath) {
    return $.getJSON("flasher/list-nodes", { folder: folderPath });
  }

  function createFsNode(folderPath, nodeName) {
    return $.ajax({
      url: "flasher/create-node",
      method: "POST",
      data: { folder: folderPath, nodeName: nodeName }
    });
  }

  function renameFsNode(folderPath, from, to) {
    return $.ajax({
      url: "flasher/rename-node",
      method: "POST",
      data: { folder: folderPath, from: from, to: to }
    });
  }

  function fillSelect($select, items, keepValue) {
    var prev = keepValue !== undefined ? keepValue : $select.val();
    $select.empty();
    (items || []).forEach(function (name) {
      $select.append($("<option/>").attr("value", name).text(name));
    });
    // якщо попереднє значення ще існує — залишимо його вибраним
    if (prev && items && items.indexOf(prev) !== -1) {
      $select.val(prev);
    } else if (items && items.length) {
      // виберемо перше для зручності
      $select.val(items[0]);
    }
  }

  function refreshNodeList() {
    var folderPath = getFolderPathFromConfigPicker();
    var $select = $("#node-input-nodeName");
    if (!folderPath) {
      fillSelect($select, []);
      return;
    }
    listFsNodes(folderPath)
      .done(function (items) {
        fillSelect($select, items);
      })
      .fail(function (xhr) {
        RED.notify((xhr && xhr.responseText) || "Failed to list nodes", "error");
      });
  }

  function validName(s) {
    return /^[a-zA-Z0-9._-]{1,64}$/.test(s);
  }

  function hookCreateAndRename() {
    var $select = $("#node-input-nodeName");
    var $btnAdd = $("#flasher-node-add");
    var $btnRen = $("#flasher-node-rename");

    $btnAdd.on("click", function () {
      var folderPath = getFolderPathFromConfigPicker();
      if (!folderPath) {
        RED.notify("Select Folder Config first", "warning");
        return;
      }
      var name = window.prompt("New node name:", "newNode");
      if (name == null) return; // cancel
      name = (name || "").trim();
      if (!name) return;
      if (!validName(name)) {
        RED.notify("Invalid name. Use letters, numbers, . _ - (max 64).", "warning");
        return;
      }
      createFsNode(folderPath, name)
        .done(function () {
          RED.notify("Node folder created: " + name, "success");
          // оновимо список і виберемо щойно створену
          listFsNodes(folderPath).done(function (items) {
            fillSelect($select, items, name);
          });
        })
        .fail(function (xhr) {
          RED.notify((xhr && xhr.responseText) || "Failed to create node", "error");
        });
    });

    $btnRen.on("click", function () {
      var folderPath = getFolderPathFromConfigPicker();
      if (!folderPath) {
        RED.notify("Select Folder Config first", "warning");
        return;
      }
      var from = ($select.val() || "").trim();
      if (!from) {
        RED.notify("No node selected", "warning");
        return;
      }
      var to = window.prompt("Rename node to:", from);
      if (to == null) return; // cancel
      to = (to || "").trim();
      if (!to || to === from) return;
      if (!validName(to)) {
        RED.notify("Invalid name. Use letters, numbers, . _ - (max 64).", "warning");
        return;
      }
      renameFsNode(folderPath, from, to)
        .done(function () {
          RED.notify("Renamed: " + from + " → " + to, "success");
          listFsNodes(folderPath).done(function (items) {
            fillSelect($select, items, to);
          });
        })
        .fail(function (xhr) {
          RED.notify((xhr && xhr.responseText) || "Failed to rename node", "error");
        });
    });
  }

  // Публічний ініціалізатор: викликається з oneditprepare головної ноди
  window.flasherSetupNodeSelectorMain = function () {
    // при відкритті — одразу підтягнути
    refreshNodeList();
    // якщо користувач змінить конфіг-ноду Folder — оновити список
    $("#node-input-folder").on("change", refreshNodeList);
    // кнопки + і ✏️
    hookCreateAndRename();
  };

})();
