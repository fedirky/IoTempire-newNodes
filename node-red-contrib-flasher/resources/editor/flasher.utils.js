/* Utils + shared state for flasher editor logic */
/* Expose everything on window.* so it works inside Node-RED editor sandbox */

(function () {
  // ---- Global constants pulled from original code ----
  const FLASHER_CONTROLLER_PINS = {
    "Wemos D1 Mini": ["D0","D1","D2","D3","D4","D5","D6","D7","D8","A0"],
    "m5stickc":      ["G0","G26","G32","G33","G34","G36"]  // example subset
  };

  const FLASHER_SENSOR_SPEC = {
    "":        [],
    "dht":     ["Pin1"],
    "hcsr04":  ["Pin1","Pin2"],
    "mfrc522": []   // requires hardware pins; no manual selection
  };

  // ---- State bootstrap ----
  function flasherInitState(ctx) {
    return {
      ctx,                // Node-RED 'this' (node instance)
      $: window.$,        // jQuery from editor
      pins: FLASHER_CONTROLLER_PINS,
      spec: FLASHER_SENSOR_SPEC
    };
  }

  // ---- Field population (kept same as original) ----
  function flasherPopulateBaseFields(state) {
    const { ctx, $ } = state;
    $("#node-input-name").val(ctx.name);
    $("#node-input-nodeName").val(ctx.nodeName);
    $("#node-input-port").val(ctx.port);
    $("#node-input-controllerType").val(ctx.controllerType);

    $("#node-input-sensor1").val(ctx.sensor1 || "");
    $("#node-input-mqttChannel1").val(ctx.mqttChannel1 || "");
    $("#node-input-sensor1Pins").val(ctx.sensor1Pins || "");

    $("#node-input-sensor2").val(ctx.sensor2 || "");
    $("#node-input-mqttChannel2").val(ctx.mqttChannel2 || "");
    $("#node-input-sensor2Pins").val(ctx.sensor2Pins || "");

    $("#node-input-sensor3").val(ctx.sensor3 || "");
    $("#node-input-mqttChannel3").val(ctx.mqttChannel3 || "");
    $("#node-input-sensor3Pins").val(ctx.sensor3Pins || "");
  }

  // ---- UI helpers: labels/buttons ----
  function flasherUpdateSensorButton(state, idx) {
    const { $ } = state;
    const s = $("#node-input-sensor" + idx).val() || "";
    const t = $("#node-input-mqttChannel" + idx).val() || "";
    let label = "Sensor " + idx + " Settings…";
    if (s) label = s + (t ? " → " + t : "");
    $("#btn-s" + idx).text(label);
  }

  function flasherUpdatePinsButton(state, idx) {
    const { spec, $ } = state;
    const s = $("#node-input-sensor" + idx).val() || "";
    const pinsStr = $("#node-input-sensor" + idx + "Pins").val() || "";
    const needed = spec[s] || [];
    let label = "Pins…";
    if (!s || needed.length === 0) {
      label = "Pins… (n/a)";
    } else if (pinsStr) {
      label = "Pins: " + pinsStr;
    }
    const $btn = $("#btn-s" + idx + "-p");
    $btn.text(label);
    $btn.prop("disabled", (!s || needed.length === 0));
  }

  function flasherUpdateNodeLabel(state) {
    const { $ } = state;
    const n = {
      name: $("#node-input-name").val(),
      nodeName: $("#node-input-nodeName").val(),
      controllerType: $("#node-input-controllerType").val()
    };
    const s = [
      $("#node-input-sensor1").val(),
      $("#node-input-sensor2").val(),
      $("#node-input-sensor3").val()
    ].filter(Boolean);
    $(".node-input-label").text(
      RED._(n.name || `flasher ${n.controllerType} ${s.length ? s.join('+') : 'no-sensor'} ${n.nodeName}`)
    );
  }

  function flasherBindLabelSync(state) {
    const { $ } = state;
    [
      "#node-input-name",
      "#node-input-nodeName",
      "#node-input-controllerType",
      "#node-input-port",
      "#node-input-folder",

      "#node-input-sensor1",
      "#node-input-mqttChannel1",
      "#node-input-sensor1Pins",

      "#node-input-sensor2",
      "#node-input-mqttChannel2",
      "#node-input-sensor2Pins",

      "#node-input-sensor3",
      "#node-input-mqttChannel3",
      "#node-input-sensor3Pins"
    ].forEach(function(sel){
      $(sel).on('change keyup', function(){
        flasherUpdateNodeLabel(state);
      });
    });
  }

  function flasherSetupTabs(state) {
    const { $ } = state;
    $("#node-config-flasher-tabs li").on('click', function() {
      const id = $(this).attr('id');
      $("#node-config-flasher-tabs li").removeClass('active');
      $(this).addClass('active');
      $("#node-config-flasher-tabs-content > div").hide();
      if (id === 'red-ui-tab-flasher-folder') {
        $('#flasher-tab-folder').show();
      } else {
        $('#flasher-tab-sensor').show();
      }
    });
  }

  // ---- Controller change → refresh pins buttons ----
  function flasherBindControllerChange(state) {
    const { $ } = state;
    $("#node-input-controllerType").on("change", function(){
      [1,2,3].forEach(function(i){ flasherUpdatePinsButton(state, i); });
    });
  }

  // Expose to global scope
  window.flasherInitState = flasherInitState;
  window.flasherPopulateBaseFields = flasherPopulateBaseFields;
  window.flasherUpdateSensorButton = flasherUpdateSensorButton;
  window.flasherUpdatePinsButton = flasherUpdatePinsButton;
  window.flasherUpdateNodeLabel = flasherUpdateNodeLabel;
  window.flasherBindLabelSync = flasherBindLabelSync;
  window.flasherSetupTabs = flasherSetupTabs;
  window.flasherBindControllerChange = flasherBindControllerChange;

  // Also expose constants in case you need them elsewhere
  window.FLASHER_CONTROLLER_PINS = FLASHER_CONTROLLER_PINS;
  window.FLASHER_SENSOR_SPEC = FLASHER_SENSOR_SPEC;
})();
