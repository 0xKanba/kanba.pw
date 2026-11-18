(function () {
  var file = document.getElementById("s-file");
  var label = document.getElementById("s-label");
  var go = document.getElementById("s-go");
  var err = document.getElementById("s-err");
  var stage = document.getElementById("s-stage");
  var out = document.getElementById("s-out");
  var picked = null;
  var KEY = "kanba.scan";

  function say(msg) { err.textContent = msg || ""; }

  function isSvg(f) {
    return f.type === "image/svg+xml" || /\.svg$/i.test(f.name);
  }
  function isPng(f) {
    return f.type === "image/png" || /\.png$/i.test(f.name);
  }

  function sheet(img) {
    var nw = img.naturalWidth || img.width || 800;
    var nh = img.naturalHeight || img.height || 800;
    var max = 1400;
    var scale = Math.min(1, max / Math.max(nw, nh));
    var w = Math.max(1, Math.round(nw * scale));
    var h = Math.max(1, Math.round(nh * scale));
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    var ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, w, h);
    return c;
  }

  function readCanvas(canvas) {
    if (!window.ZXing) return "";
    var hints = new Map();
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.QR_CODE]);
    var bins = [ZXing.HybridBinarizer, ZXing.GlobalHistogramBinarizer];
    for (var i = 0; i < bins.length; i++) {
      try {
        var reader = new ZXing.MultiFormatReader();
        reader.setHints(hints);
        var source = new ZXing.HTMLCanvasElementLuminanceSource(canvas);
        return reader.decode(new ZXing.BinaryBitmap(new bins[i](source))).getText();
      } catch (e) {}
    }
    return "";
  }

  function crop(src, x, y, s) {
    var c = document.createElement("canvas");
    c.width = s;
    c.height = s;
    var g = c.getContext("2d", { willReadFrequently: true });
    g.imageSmoothingEnabled = false;
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, s, s);
    g.drawImage(src, x, y, s, s, 0, 0, s, s);
    return c;
  }

  function findIn(canvas) {
    var text = readCanvas(canvas);
    if (text) return text;
    var tiles = [Math.min(canvas.width, canvas.height), 520, 360];
    for (var t = 0; t < tiles.length; t++) {
      var tile = Math.max(160, Math.round(tiles[t]));
      if (tile > canvas.width && tile > canvas.height) continue;
      var step = Math.max(80, Math.round(tile * 0.45));
      for (var y = 0; y < canvas.height; y += step) {
        for (var x = 0; x < canvas.width; x += step) {
          text = readCanvas(crop(canvas, x, y, tile));
          if (text) return text;
        }
      }
    }
    return "";
  }

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("read")); };
      img.src = url;
    });
  }

  function prepareUrl(file) {
    if (!isSvg(file)) return Promise.resolve(URL.createObjectURL(file));
    return file.text().then(function (text) {
      if (!/\swidth=/.test(text)) text = text.replace(/<svg\b/i, '<svg width="1024" height="1024"');
      return URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
    });
  }

  function decode(file) {
    say("");
    prepareUrl(file).then(loadImage).then(function (img) {
      var text = findIn(sheet(img));
      if (!text) { say("No QR found in that image."); return; }
      out.value = text;
      localStorage.setItem(KEY, text);
      var link = document.getElementById("s-save");
      link.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
      link.download = "qr.txt";
      stage.classList.add("show");
    }).catch(function () {
      say("Could not read that PNG or SVG.");
    });
  }

  var kept = localStorage.getItem(KEY);
  if (kept) {
    out.value = kept;
    var link = document.getElementById("s-save");
    link.href = URL.createObjectURL(new Blob([kept], { type: "text/plain;charset=utf-8" }));
    link.download = "qr.txt";
    stage.classList.add("show");
  }

  file.onchange = function () {
    var f = file.files && file.files[0];
    if (!f) return;
    if (!isPng(f) && !isSvg(f)) { say("Use a PNG or SVG file."); return; }
    picked = f;
    label.textContent = f.name;
    label.parentElement.classList.add("has");
    say("");
  };
  document.getElementById("s-clear").onclick = function () {
    file.value = ""; picked = null; label.textContent = "PNG or SVG";
    label.parentElement.classList.remove("has");
  };
  document.getElementById("s-close").onclick = function () {
    stage.classList.remove("show");
  };
  go.onclick = function () {
    if (!picked) { say("Choose a PNG or SVG."); return; }
    decode(picked);
  };
  document.getElementById("s-copy").onclick = function () {
    var btn = this;
    navigator.clipboard.writeText(out.value || "").then(function () {
      btn.textContent = "Copied";
      setTimeout(function () { btn.textContent = "Copy"; }, 900);
    });
  };
  document.getElementById("s-save").onclick = function (e) {
    if (!this.getAttribute("href")) e.preventDefault();
  };
})();
