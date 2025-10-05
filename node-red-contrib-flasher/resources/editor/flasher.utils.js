/* flasher.utils.js
 * Utils + shared state for flasher editor logic (Node-RED editor sandbox)
 * Everything is exposed on window.*.
 */

(function () {
  // ---- Global constants ----
  const FLASHER_CONTROLLER_PINS = {
    "Wemos D1 Mini": ["D0","D1","D2","D3","D4","D5","D6","D7","D8","A0"],
    "m5stickc_plus": ["G26", "G25", "G0"],
    "m5stickc_plus2": ["G26", "G25", "G0"]
  };

  // Default controllers if not specified per-device (devices.ini doesn't carry this)
  const DEFAULT_CONTROLLERS = ["Wemos D1 Mini","m5stickc_plus","m5stickc_plus2"];

  // Minimal placeholder spec until devices.ini is loaded
  let FLASHER_SENSOR_SPEC = {
    "": {
      label: "— None —",
      pins: [],
      controllers: DEFAULT_CONTROLLERS
    }
  };

  // ---- devices.ini loader & parser ----

  function getCurrentScriptBase() {
    // Find the script tag whose src ends with 'flasher.utils.js' and derive its base URL
    const scripts = document.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
      const src = scripts[i].getAttribute('src') || '';
      if (src.indexOf('flasher.utils.js') !== -1) {
        const q = src.indexOf('?') !== -1 ? src.indexOf('?') : src.length;
        const trimmed = src.substring(0, q);
        const lastSlash = trimmed.lastIndexOf('/');
        return lastSlash === -1 ? '.' : trimmed.substring(0, lastSlash);
      }
    }
    return '.'; // fallback
  }

  function fetchDevicesIni() {
    const base = getCurrentScriptBase();
    const url = base + '/devices.ini';
    return $.ajax({ url, dataType: 'text', cache: false });
  }

  function parseDevicesIniToSpec(text) {
    const lines = text.split(/\r?\n/);
    const sections = {};
    let current = null;

    for (let raw of lines) {
      // strip comments starting with ';' (ini style)
      let line = raw;
      const sc = line.indexOf(';');
      if (sc !== -1) line = line.slice(0, sc);
      line = line.trim();
      if (!line) continue;

      const secMatch = line.match(/^\[([^\]]+)\]$/);
      if (secMatch) {
        const name = secMatch[1].trim();
        current = (sections[name] = sections[name] || { __name: name });
        continue;
      }

      if (!current) continue;

      const kv = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if (kv) {
        const key = kv[1].toLowerCase();
        const val = kv[2].trim();
        current[key] = val;
      }
    }

    // Build FLASHER spec from sections that have a 'label'
    const spec = {
      "": {
        label: "— None —",
        pins: [],
        controllers: DEFAULT_CONTROLLERS
      }
    };

    Object.keys(sections).forEach((name) => {
      const sec = sections[name];
      if (!sec || !sec.label) return; // only sections with a label are included

      // pins: comma-separated → array of required pin field names
      const pins = (sec.pins || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      // controllers: default to all 3 unless device needs restriction
      let controllers = DEFAULT_CONTROLLERS.slice();
      if (name === 'mfrc522') controllers = ["Wemos D1 Mini"]; // exception
      //TODO: Need to add it to devices.ini
      spec[name] = {
        label: sec.label,
        pins,
        controllers,
        start: sec.start || "" // keep for code generation (not used by UI directly)
      };
    });

    return spec;
  }

  function loadFlasherSpecFromIni() {
    return fetchDevicesIni()
      .then(parseDevicesIniToSpec)
      .then((spec) => {
        FLASHER_SENSOR_SPEC = spec;
        // expose globally
        window.FLASHER_SENSOR_SPEC = FLASHER_SENSOR_SPEC;
        return spec;
      })
      .catch((err) => {
        console.error('Failed to load devices.ini:', err);
        // still expose whatever placeholder we have
        window.FLASHER_SENSOR_SPEC = FLASHER_SENSOR_SPEC;
        return FLASHER_SENSOR_SPEC;
      });
  }

  // ---- State bootstrap ----
  function flasherInitState(ctx) {
    const state = {
      ctx,                // Node-RED 'this' (node instance)
      $: window.$,        // jQuery from editor
      pins: FLASHER_CONTROLLER_PINS,
      spec: FLASHER_SENSOR_SPEC
    };

    // Load spec asynchronously from devices.ini, then refresh UI bits
    loadFlasherSpecFromIni().then((spec) => {
      state.spec = spec;

      // Refresh selects & pins buttons using the loaded spec
      try {
        // Re-populate sensor selects per controller
        ['1','2','3'].forEach((i) => {
          const $sel = $("#node-input-sensor" + i);
          const current = $sel.val();
          flasherPopulateSensorSelect(state, $sel, current);
          flasherUpdateSensorButton(state, i);
          flasherUpdatePinsButton(state, i);
        });

        // Re-validate combos silently
        [1,2,3].forEach((i)=> flasherEnforceSensorCompatibility(state, i, /*silent=*/true));

      } catch (e) { /* ignore editor-timing races */ }
    });

    // Ensure initial compatibility (in case flow had invalid combos) even before spec arrives
    try {
      [1,2,3].forEach((i) => flasherEnforceSensorCompatibility(state, i, /*silent=*/true));
    } catch(e) {}

    return state;
  }

  // ---- Helpers: sensor <-> controller compatibility ----
  function flasherIsSensorSupported(state, sensorType) {
    const { spec, $ } = state;
    const ctrl = $("#node-input-controllerType").val();
    const s = spec[sensorType] || spec[""] || {};
    const controllers = (s.controllers && s.controllers.length) ? s.controllers : DEFAULT_CONTROLLERS;
    return controllers.includes(ctrl);
  }

  function flasherGetSupportedSensors(state) {
    const { spec, $ } = state;
    const ctrl = $("#node-input-controllerType").val();
    const keys = Object.keys(spec);
    return keys.filter((k) => {
      const entry = spec[k] || {};
      const controllers = (entry.controllers && entry.controllers.length) ? entry.controllers : DEFAULT_CONTROLLERS;
      return controllers.includes(ctrl);
    });
  }

  function flasherGetSensorPinsSpec(state, sensorType) {
    const { spec } = state;
    const s = spec[sensorType] || spec[""] || {};
    return s.pins || [];
  }

  /**
   * If selected sensor is not supported by current controller —
   * clear sensor, its MQTT channel and pins. Returns true if changed.
   */
  function flasherEnforceSensorCompatibility(state, idx, silent=false) {
    const { $ } = state;
    const selSensor = $("#node-input-sensor" + idx).val() || "";
    if (!selSensor) return false;
    if (flasherIsSensorSupported(state, selSensor)) return false;

    $("#node-input-sensor" + idx).val("");
    $("#node-input-mqttChannel" + idx).val("");
    $("#node-input-sensor" + idx + "Pins").val("");

    flasherUpdateSensorButton(state, idx);
    flasherUpdatePinsButton(state, idx);

    if (!silent) {
      try { RED.notify(`Sensor ${selSensor} is not supported by the selected controller. It was cleared.`, "warning"); } catch(e) {}
    }
    return true;
  }

  /**
   * Build a <select> with sensors supported by the current controller.
   * @param state - from flasherInitState
   * @param $select - jQuery of the <select>
   * @param currentValue - optional current sensor value to preselect
   */
  function flasherPopulateSensorSelect(state, $select, currentValue) {
    const { spec } = state;
    const supported = flasherGetSupportedSensors(state); // e.g., ["", "dht", "hcsr04"]

    $select.empty();
    supported.forEach((key) => {
      const meta = spec[key] || { label: key, pins: [], controllers: DEFAULT_CONTROLLERS };
      const opt = $("<option/>").attr("value", key).text(meta.label || key);
      $select.append(opt);
    });

    if (currentValue && supported.includes(currentValue)) {
      $select.val(currentValue);
    } else {
      $select.val(supported[0] || "");
    }
  }

  // ---- Field population ----
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

    // Re-validate after populating
    [1,2,3].forEach((i)=> flasherEnforceSensorCompatibility(state, i, /*silent=*/true));
  }

  // ---- UI helpers: labels/buttons ----
  function flasherUpdateSensorButton(state, idx) {
    const { $ } = state;
    const s = $("#node-input-sensor" + idx).val() || "";
    const t = $("#node-input-mqttChannel" + idx).val() || "";
    let label = "Sensor " + idx + " Settings…";
    if (s) label = (state.spec[s]?.label || s) + (t ? " → " + t : "");
    $("#btn-s" + idx).text(label);
  }

  function flasherUpdatePinsButton(state, idx) {
    const { $ } = state;
    const s = $("#node-input-sensor" + idx).val() || "";
    const pinsStr = $("#node-input-sensor" + idx + "Pins").val() || "";
    const needed = flasherGetSensorPinsSpec(state, s);
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

  // ---- Controller change → revalidate sensors + refresh pins buttons ----
  function flasherBindControllerChange(state) {
    const { $ } = state;
    $("#node-input-controllerType").on("change", function(){
      [1,2,3].forEach(function(i){
        flasherEnforceSensorCompatibility(state, i);
        flasherUpdatePinsButton(state, i);
      });
    });
  }

  // ---- Expose to global scope ----
  window.flasherInitState = flasherInitState;
  window.flasherPopulateBaseFields = flasherPopulateBaseFields;
  window.flasherUpdateSensorButton = flasherUpdateSensorButton;
  window.flasherUpdatePinsButton = flasherUpdatePinsButton;
  window.flasherUpdateNodeLabel = flasherUpdateNodeLabel;
  window.flasherBindLabelSync = flasherBindLabelSync;
  window.flasherSetupTabs = flasherSetupTabs;
  window.flasherBindControllerChange = flasherBindControllerChange;

  // New helpers for other modules (e.g., dialogs)
  window.flasherIsSensorSupported = flasherIsSensorSupported;
  window.flasherGetSupportedSensors = flasherGetSupportedSensors;
  window.flasherGetSensorPinsSpec = flasherGetSensorPinsSpec;
  window.flasherEnforceSensorCompatibility = flasherEnforceSensorCompatibility;
  window.flasherPopulateSensorSelect = flasherPopulateSensorSelect;

  // Also expose constants in case you need them elsewhere
  window.FLASHER_CONTROLLER_PINS = FLASHER_CONTROLLER_PINS;
  window.FLASHER_SENSOR_SPEC = FLASHER_SENSOR_SPEC; // will be replaced after load
})();
