// resources/editor/flasher.filters.js
(function(){
  // Опис усіх доступних фільтрів
  const FILTERS = {
    "average": {
      label: "Average",
      fields: [
        { key:"buflen", label:"Buffer length", type:"number", min:1, placeholder:"100", def:100 }
      ],
      toCode: p => `.filter_average(${p.buflen})`
    },
    "jmc_median": {
      label: "JMC Running Median",
      fields: [],
      toCode: _ => `.filter_jmc_median()`
    },
    "jmc_interval_median": {
      label: "JMC Interval Median",
      fields: [
        { key:"update_ms", label:"Update interval (ms)", type:"number", min:1, placeholder:"500", def:500 },
        { key:"reset_each_ms", label:"Reset each (ms) — optional", type:"number", min:1, optional:true }
      ],
      toCode: p => {
        if (p.reset_each_ms) return `.filter_jmc_interval_median(${p.reset_each_ms})`;
        return `.filter_jmc_interval_median(${p.update_ms})`;
      }
    },
    "minchange": {
      label: "Min Change",
      fields: [
        { key:"minchange", label:"Minimum change", type:"number", step:"any", placeholder:"0.1", def:0.1 }
      ],
      toCode: p => `.filter_minchange(${p.minchange})`
    },
    "binarize": {
      label: "Binarize",
      fields: [
        { key:"cutoff", label:"Cutoff / threshold", type:"number", step:"any", placeholder:"0.5", def:0.5 },
        { key:"high",   label:"High value", type:"text", placeholder:"on", def:"on" },
        { key:"low",    label:"Low value",  type:"text", placeholder:"off", def:"off" }
      ],
      toCode: p => `.filter_binarize(${p.cutoff}, ${JSON.stringify(p.high)}, ${JSON.stringify(p.low)})`
    },
    "round": {
      label: "Round",
      fields: [
        { key:"base", label:"Base (step)", type:"number", step:"any", placeholder:"1", def:1 }
      ],
      toCode: p => `.filter_round(${p.base})`
    },
    "limit_time": {
      label: "Limit per Time",
      fields: [
        { key:"interval", label:"Interval (ms)", type:"number", min:1, placeholder:"500", def:500 }
      ],
      toCode: p => `.filter_limit_time(${p.interval})`
    },
    "detect_click": {
      label: "Click Detector",
      hint:  "All parameters optional; defaults are used if left blank.",
      fields: [
        { key:"click_min_ms",      label:"Click min (ms)", type:"number", optional:true },
        { key:"click_max_ms",      label:"Click max (ms)", type:"number", optional:true },
        { key:"longclick_min_ms",  label:"Long click min (ms)", type:"number", optional:true },
        { key:"longclick_max_ms",  label:"Long click max (ms)", type:"number", optional:true },
        { key:"pressed_str",       label:"Pressed label", type:"text", optional:true },
        { key:"released_str",      label:"Released label", type:"text", optional:true }
      ],
      toCode: p => {
        const vals = [
          p.click_min_ms, p.click_max_ms, p.longclick_min_ms, p.longclick_max_ms,
          (p.pressed_str!=null && p.pressed_str!=="") ? JSON.stringify(p.pressed_str) : undefined,
          (p.released_str!=null && p.released_str!=="") ? JSON.stringify(p.released_str) : undefined
        ].filter(v => v!==undefined && v!=="");
        return `.filter_detect_click(${vals.join(", ")})`;
      }
    },
    "interval_map": {
      label: "Interval Map",
      hint:  "Enter pairs v0,b0,v1,b1,...,vn. Example: \"low\",-0.5,, ,0.5,\"high\"",
      fields: [
        { key:"pairs", label:"Pairs (CSV)", type:"textarea", rows:3, placeholder:'"low",-0.5,, ,0.5,"high"' }
      ],
      toCode: p => `.filter_interval_map(${p.pairs})`
    }
  };

  // --- helpers ---
  function getNode(state){
    if (state && typeof state === "object" && state.node) return state.node;
    return state || {};
  }

  function readParamsFromNode(state, idx){
    const node = getNode(state);
    const raw = (node["filter"+idx+"Params"] || "");
    try { return raw ? JSON.parse(raw) : {}; } catch(e){ return {}; }
  }

  function writeParamsToNode(state, idx, obj){
    const node = getNode(state);
    const json = JSON.stringify(obj || {});
    node["filter"+idx+"Params"] = json;
    // keep hidden input in sync
    const $hidden = $("#node-input-filter"+idx+"Params");
    if ($hidden.length) $hidden.val(json);
  }

  function buildFieldRow(f, val){
    const v = (val==null ? (f.def!==undefined? f.def:"") : val);
    const $row = $('<div class="form-row"></div>');
    const id  = "ff-"+f.key;
    $row.append(`<label for="${id}">${f.label}</label>`);
    if (f.type==="textarea"){
      const $ta = $(`<textarea id="${id}" rows="${f.rows||3}" placeholder="${f.placeholder||''}"></textarea>`).val(v);
      $row.append($ta);
    } else {
      const $in = $(`<input id="${id}" type="${f.type||'text'}" placeholder="${f.placeholder||''}">`).val(v);
      if (f.min!=null)  $in.attr("min", f.min);
      if (f.step!=null) $in.attr("step", f.step);
      $row.append($in);
    }
    return $row;
  }

  function gatherParams(def){
    const obj = {};
    (def.fields||[]).forEach(f=>{
      const id = "#ff-"+f.key;
      let v = $(id).val();
      if (f.type==="number") {
        v = v==="" ? "" : Number(v);
      }
      obj[f.key] = v;
    });
    return obj;
  }

  function openDialog(state, idx){
    const type = $("#node-input-filter"+idx+"Type").val() || "";
    const def  = FILTERS[type];
    const $host = $("#filter-dynamic").empty();

    if (!type){
      $host.append(`<p>No filter selected.</p>`);
    } else if (!def){
      $host.append(`<p>Unknown filter: ${type}</p>`);
    } else {
      const current = readParamsFromNode(state, idx);
      if (def.hint) $host.append(`<div class="red-ui-help"><em>${def.hint}</em></div>`);
      (def.fields||[]).forEach(f=>{
        $host.append( buildFieldRow(f, current[f.key]) );
      });
    }

    $("#flasher-filter-dialog").dialog({
      modal: true,
      width: 520,
      title: `Filter Settings — Sensor ${idx}`,
      buttons: [
        {
          text: "Save",
          class: "primary",
          click: function(){
            if (type && FILTERS[type]){
              const params = gatherParams(FILTERS[type]);
              writeParamsToNode(state, idx, params);
            } else {
              writeParamsToNode(state, idx, {});
            }
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

  function bindSelect(state, idx){
    const node = getNode(state);
    const $sel = $("#node-input-filter"+idx+"Type");
    if (!$sel.length) return;
    $sel.val(node["filter"+idx+"Type"] || "");
    $sel.on("change", function(){
      node["filter"+idx+"Type"] = $(this).val();
    });
  }

  // API
  window.flasherInitFilterUI = function(state, idx){
    const node = getNode(state);
    bindSelect(state, idx);
    if (!node["filter"+idx+"Params"]) writeParamsToNode(state, idx, {});
  };

  window.flasherOpenFilterDialog = function(state, idx){
    openDialog(state, idx);
  };

  window.flasherFilterToCode = function(type, params){
    const def = FILTERS[type];
    if (!type || !def) return "";
    return def.toCode(params||{});
  };
})();
