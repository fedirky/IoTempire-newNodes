/* flasher.utils.js
 * Utils + shared state for flasher editor logic (Node-RED editor sandbox)
 * Everything is exposed on window.*.
 */

(function () {
  // ---- Global constants ----
  const FLASHER_CONTROLLER_PINS = {
    "Wemos D1 Mini": ["D0","D1","D2","D3","D4","D5","D6","D7","D8","A0"],
    "m5stickc_plus":      ["G26", "G25", "G0"],
    "m5stickc_plus2":       ["G26", "G25", "G0"]
  };

  /**
   * SENSOR SPEC:
   * - label: shown in dropdowns
   * - pins: which pin fields must be manually selected (empty => no manual pins)
   * - controllers: list of controllers that support this sensor
   */
  const FLASHER_SENSOR_SPEC = {
    "": {
      label: "— None —",
      pins: [],
      controllers: ["Wemos D1 Mini","m5stickc_plus", "m5stickc_plus2"]
    },
    "bmp085": {
      label: "Barometer (BMP085)",
      pins: ["SDA","SCL"],
      controllers: ["Wemos D1 Mini", "m5stickc_plus", "m5stickc_plus2"]
    },
    "bmp180": {
      label: "Barometer (BMP180)",
      pins: ["SDA","SCL"],
      controllers: ["Wemos D1 Mini", "m5stickc_plus", "m5stickc_plus2"]
    },
    "bmp280": {
      label: "Barometer (BMP280)",
      pins: ["SDA","SCL"],
      controllers: ["Wemos D1 Mini", "m5stickc_plus", "m5stickc_plus2"]
    },
    "button": {
      label: "Button (Input)",
      pins: ["Pin"],
      controllers: ["Wemos D1 Mini", "m5stickc_plus", "m5stickc_plus2"]
    },
    "display": {
      label: "Display (SSD1306/u8g2)",
      pins: ["SDA","SCL"],
      controllers: ["Wemos D1 Mini", "m5stickc_plus", "m5stickc_plus2"]
    },
    "display44780": {
      label: "LCD Display (HD44780/PCF8574T)",
      pins: ["SDA","SCL"],
      controllers: ["Wemos D1 Mini", "m5stickc_plus", "m5stickc_plus2"]
    },
    "dht": {
      label: "Temperature/Humidity (DHT)",
      pins: ["Pin1"],
      controllers: ["Wemos D1 Mini","m5stickc_plus", "m5stickc_plus2"]
    },
    "gyro6050": {
      label: "Gyroscope (MPU6050)",
      pins: ["SDA","SCL"],
      controllers: ["Wemos D1 Mini", "m5stickc_plus", "m5stickc_plus2"]
    },
    "gyro9250": {
      label: "Gyroscope (MPU9250)",
      pins: ["SDA","SCL"],
      controllers: ["Wemos D1 Mini", "m5stickc_plus", "m5stickc_plus2"]
    },
    "hx711": {
      label: "Load Cell / Weight Sensor (HX711)",
      pins: ["SCK", "DOUT"],
      controllers: ["Wemos D1 Mini", "m5stickc_plus", "m5stickc_plus2"]
    },
    "output": {
      label: "Output (LED / Relay)",
      pins: ["Pin"],
      controllers: ["Wemos D1 Mini", "m5stickc_plus", "m5stickc_plus2"]
    },
    "mpr121": {
      label: "Capacitive Touch (MPR121)",
      pins: ["SDA","SCL"],
      controllers: ["Wemos D1 Mini", "m5stickc_plus", "m5stickc_plus2"]
    },
    "hcsr04": {
      label: "Ultrasonic Distance (hcsr04/rcwl-1601)",
      pins: ["Pin1","Pin2"],
      controllers: ["Wemos D1 Mini","m5stickc_plus", "m5stickc_plus2"]
    },
    "mfrc522": {
      label: "Tag Reader (MFRC522)",
      pins: [], // hardware-bound; no manual selection
      controllers: ["Wemos D1 Mini"] // not supported on m5stickc
    },
    "pwm": {
      label: "PWM Output 1000",
      pins: ["Pin"],
      controllers: ["Wemos D1 Mini", "m5stickc_plus", "m5stickc_plus2"]
    },
    "rgb_single": {
      label: "RGB LED (single)",
      pins: ["R", "G", "B"],
      controllers: ["Wemos D1 Mini", "m5stickc_plus", "m5stickc_plus2"]
    },
    "rgb_single_inverted": {
      label: "RGB LED (single inverted)",
      pins: ["R", "G", "B"],
      controllers: ["Wemos D1 Mini", "m5stickc_plus", "m5stickc_plus2"]
    },
    "rgb_strip_grb": {
      label: "RGB LED Strip (F_GRB)",
      pins: ["DataPin"],
      controllers: ["Wemos D1 Mini", "m5stickc_plus", "m5stickc_plus2", "esp32"]
    },
    "rgb_strip_brg": {
      label: "RGB LED Strip (F_BRG)",
      pins: ["DataPin"],
      controllers: ["Wemos D1 Mini", "m5stickc_plus", "m5stickc_plus2", "esp32"]
    },
    "servo": {
      label: "Servo Motor",
      pins: ["Pin"],
      controllers: ["Wemos D1 Mini", "m5stickc_plus", "m5stickc_plus2", "esp32"]
    },
    "servo_switch": {
      label: "Servo Switch",
      pins: ["Pin"],
      controllers: ["Wemos D1 Mini", "m5stickc_plus", "m5stickc_plus2", "esp32"]
    },

  };
  //TODO: Sensirion SCD4X CO2 sensor and Grove SGP30 gas sensor¶



  // ---- State bootstrap ----
  function flasherInitState(ctx) {
    const state = {
      ctx,                // Node-RED 'this' (node instance)
      $: window.$,        // jQuery from editor
      pins: FLASHER_CONTROLLER_PINS,
      spec: FLASHER_SENSOR_SPEC
    };

    // Ensure initial compatibility (in case flow had invalid combos)
    try {
      [1,2,3].forEach((i) => flasherEnforceSensorCompatibility(state, i, /*silent=*/true));
    } catch(e) {}

    return state;
  }

  // ---- Helpers: sensor <-> controller compatibility ----
  function flasherIsSensorSupported(state, sensorType) {
    const { spec, $ } = state;
    const ctrl = $("#node-input-controllerType").val();
    const s = spec[sensorType] || spec[""];
    return (s.controllers || []).includes(ctrl);
  }

  function flasherGetSupportedSensors(state) {
    const { spec, $ } = state;
    const ctrl = $("#node-input-controllerType").val();
    return Object.keys(spec).filter((k) => (spec[k].controllers || []).includes(ctrl));
  }

  function flasherGetSensorPinsSpec(state, sensorType) {
    const { spec } = state;
    const s = spec[sensorType] || spec[""];
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
      const meta = spec[key] || { label: key };
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
    if (s) label = s + (t ? " → " + t : "");
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
      // If a sensor dialog is open and needs live refresh,
      // external code can call flasherPopulateSensorSelect again.
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
  window.FLASHER_SENSOR_SPEC = FLASHER_SENSOR_SPEC;
})();
