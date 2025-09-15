/* flasher.sensors.js
 * Sensor settings dialog — builds sensor list from flasher.utils.js
 */

(function(){
  /**
   * Open the Sensor Settings dialog for sensor slot idx (1..3)
   */
  function openSensorDialog(state, idx) {
    const { $ } = state;

    // Elements
    const $select = $("#dlg-sensor-type");
    const $topic  = $("#dlg-sensor-topic");

    // Current values from hidden fields
    const currentSensor = $("#node-input-sensor" + idx).val() || "";
    const currentTopic  = $("#node-input-mqttChannel" + idx).val() || "";

    // Populate sensor <select> dynamically based on current controller
    window.flasherPopulateSensorSelect(state, $select, currentSensor);
    $topic.val(currentTopic);

    // If controller changes while dialog is open, rebuild the sensor list
    // (namespace the handler so we can unbind on close)
    $("#node-input-controllerType")
      .off(".sensorDialog")
      .on("change.sensorDialog", function(){
        // Remember selection if still supported; else fallback handled by helper
        const selected = $select.val();
        window.flasherPopulateSensorSelect(state, $select, selected);
      });

    // Open jQuery UI dialog
    $("#flasher-sensor-dialog").dialog({
      modal: true,
      width: 520,
      title: "Sensor " + idx + " Settings",
      close: function() {
        // Clean up controller change binding when dialog closes
        $("#node-input-controllerType").off(".sensorDialog");
      },
      buttons: [
        {
          text: "Save",
          click: function () {
            const newSensor = $select.val() || "";
            const newTopic  = $topic.val() || "";

            // Persist to hidden fields
            $("#node-input-sensor" + idx).val(newSensor).change();
            $("#node-input-mqttChannel" + idx).val(newTopic).change();

            // If the selected sensor has no manual pins, clear any stale pins
            const needPins = window.flasherGetSensorPinsSpec(state, newSensor);
            if (!needPins || needPins.length === 0) {
              $("#node-input-sensor" + idx + "Pins").val("").change();
            }

            // UI refresh
            window.flasherUpdateSensorButton(state, idx);
            window.flasherUpdatePinsButton(state, idx);
            window.flasherUpdateNodeLabel(state);

            $(this).dialog("close");
          }
        },
        {
          text: "Cancel",
          click: function () { 
            // Also remove the controller change binding on cancel
            $("#node-input-controllerType").off(".sensorDialog");
            $(this).dialog("close"); 
          }
        }
      ]
    });
  }

  // Expose
  window.flasherOpenSensorDialog = openSensorDialog;
})();
