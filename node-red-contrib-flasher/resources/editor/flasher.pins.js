/* Pins dialog: build + open + validation */

(function(){
  function buildPinsDialog(state, idx){
    const { $, pins, spec } = state;

    const controller = $("#node-input-controllerType").val();
    const options = pins[controller] || [];
    const sensorCode = $("#node-input-sensor"+idx).val() || "";
    const req = spec[sensorCode] || [];
    const existing = ($("#node-input-sensor"+idx+"Pins").val() || "")
      .split(",").map(s=>s.trim()).filter(Boolean);

    const $wrap = $("#pins-dynamic");
    $wrap.empty();

    if (req.length === 0) {
      $wrap.append(
        '<div class="form-row"><label></label><div style="color:#666;">This sensor does not require manual pin selection on this controller.</div></div>'
      );
      return;
    }

    // Collect pins already used by other sensors
    let usedPins = [];
    [1,2,3].forEach(function(i){
      if (i !== idx) {
        const pinsStr = ($("#node-input-sensor"+i+"Pins").val() || "")
          .split(",").map(s=>s.trim()).filter(Boolean);
        usedPins = usedPins.concat(pinsStr);
      }
    });

    // Create selects
    req.forEach(function(role, i){
      const selId = "dlg-pin-"+i;
      const html = '<div class="form-row">' +
                    '<label>'+ role +'</label>' +
                    '<select id="'+ selId +'"></select>' +
                  '</div>';
      $wrap.append(html);

      const $sel = $("#"+selId);
      $sel.append('<option value="">— Select —</option>');

      options.forEach(function(p){
        const isUsedByOthers = usedPins.includes(p);
        const $opt = $('<option></option>').val(p).text(p);
        if (isUsedByOthers) $opt.prop('disabled', true);
        $sel.append($opt);
      });

      if (existing[i]) { $sel.val(existing[i]); }
    });

    // Enforce uniqueness across selects *inside this dialog*
    function refreshInDialogDisables(){
      const selected = {};
      req.forEach(function(_, i){
        const v = $("#dlg-pin-"+i).val();
        if (v) selected[v] = (selected[v] || 0) + 1;
      });

      req.forEach(function(_, i){
        const $sel = $("#dlg-pin-"+i);
        $sel.find('option').each(function(){
          const val = $(this).val();
          if (!val) return;
          const takenByOthers = (selected[val] && $sel.val() !== val);
          const disabledByOthers = $(this).prop('disabled') && !takenByOthers;
          $(this).prop('disabled', disabledByOthers || takenByOthers);
        });
      });
    }

    // Bind change handlers and run once
    req.forEach(function(_, i){
      $("#dlg-pin-"+i).on('change', refreshInDialogDisables);
    });
    refreshInDialogDisables();
  }

  function openPinsDialog(state, idx){
    const { $, spec } = state;

    buildPinsDialog(state, idx);

    $("#flasher-pins-dialog").dialog({
      modal: true,
      width: 520,
      title: "Sensor " + idx + " Pins",
      buttons: [
        {
          text: "Save",
          click: function () {
            const sensorCode = $("#node-input-sensor"+idx).val() || "";
            const req = spec[sensorCode] || [];

            // Collect selected pins in order
            const pins = [];
            let valid = true;
            for (let i=0; i<req.length; i++){
              const v = $("#dlg-pin-"+i).val();
              if (!v) { valid = false; break; }
              pins.push(v);
            }
            if (!valid) {
              $("#pins-dynamic").append('<div class="form-row"><label></label><div style="color:#b00;">Please select all required pins.</div></div>');
              return;
            }
            $("#node-input-sensor"+idx+"Pins").val(pins.join(", ")).change();
            window.flasherUpdatePinsButton(state, idx);
            $(this).dialog("close");
          }
        },
        {
          text: "Cancel",
          click: function(){ $(this).dialog("close"); }
        }
      ]
    });
  }

  // Expose
  window.flasherBuildPinsDialog = buildPinsDialog;
  window.flasherOpenPinsDialog = openPinsDialog;
})();
