/* Sensor settings dialog */

(function(){
  function openSensorDialog(state, idx) {
    const { $ } = state;

    $("#dlg-sensor-type").val($("#node-input-sensor" + idx).val() || "");
    $("#dlg-sensor-topic").val($("#node-input-mqttChannel" + idx).val() || "");

    $("#flasher-sensor-dialog").dialog({
      modal: true,
      width: 520,
      title: "Sensor " + idx + " Settings",
      buttons: [
        {
          text: "Save",
          click: function () {
            $("#node-input-sensor" + idx).val($("#dlg-sensor-type").val()).change();
            $("#node-input-mqttChannel" + idx).val($("#dlg-sensor-topic").val()).change();

            window.flasherUpdateSensorButton(state, idx);
            window.flasherUpdatePinsButton(state, idx);   // pins requirements may change with sensor type
            window.flasherUpdateNodeLabel(state);

            $(this).dialog("close");
          }
        },
        {
          text: "Cancel",
          click: function () { $(this).dialog("close"); }
        }
      ]
    });
  }

  // Expose
  window.flasherOpenSensorDialog = openSensorDialog;
})();
