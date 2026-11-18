(function () {
  var input = document.getElementById("w-text");
  var go = document.getElementById("w-go");
  var err = document.getElementById("w-err");
  var count = document.getElementById("w-count");
  var stage = document.getElementById("w-stage");
  var box = document.getElementById("w-qr");
  var zoom = document.getElementById("zoom");
  var zoomImg = document.getElementById("zoomImg");
  var fmt = "png";
  var grid = null;
  var pngUrl = "";
  var KEY = "kanba.write";

  function arm(href, name) {
    var link = document.getElementById("w-save");
    link.href = href || "";
    link.download = name;
    link.textContent = href ? "Download " + name.split(".").pop().toUpperCase() : "Download";
  }
  function refreshLink() {
    if (!pngUrl) { arm("", "qr.png"); return; }
    if (fmt === "svg" && grid) {
      arm(URL.createObjectURL(new Blob([svg()], { type: "image/svg+xml" })), "qr.svg");
      return;
    }
    arm(pngUrl, "qr.png");
  }

  function say(msg) { err.textContent = msg || ""; }

  function measure(canvas) {
    var ctx = canvas.getContext("2d");
    var w = canvas.width, h = canvas.height;
    if (!w || !h) return null;
    var d = ctx.getImageData(0, 0, w, h).data;
    function dark(x, y) { return d[(y * w + x) * 4] < 140; }
    var x0 = -1, y0 = -1;
    for (var y = 0; y < h && x0 < 0; y++) for (var x = 0; x < w; x++) if (dark(x, y)) { x0 = x; y0 = y; break; }
    if (x0 < 0) return null;
    var run = 0;
    while (x0 + run < w && dark(x0 + run, y0)) run++;
    var mw = Math.max(1, Math.round(run / 7));
    var x1 = x0, y1 = y0;
    for (var xx = w - 1; xx >= 0; xx--) {
      var hit = false;
      for (var yy = 0; yy < h; yy += mw) if (dark(xx, yy)) { hit = true; break; }
      if (hit) { x1 = xx; break; }
    }
    for (var yy2 = h - 1; yy2 >= 0; yy2--) {
      var hit2 = false;
      for (var xx2 = 0; xx2 < w; xx2 += mw) if (dark(xx2, yy2)) { hit2 = true; break; }
      if (hit2) { y1 = yy2; break; }
    }
    var n = Math.round((x1 - x0 + 1) / mw);
    if (n < 21) return null;
    var cells = [];
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (dark(x0 + c * mw + (mw >> 1), y0 + r * mw + (mw >> 1))) cells.push([c, r]);
      }
    }
    return { n: n, cells: cells, mw: mw, x0: x0, y0: y0 };
  }
  function eyes(canvas, g) {
    var ctx = canvas.getContext("2d");
    function dot(col, row) {
      var px = g.x0 + col * g.mw, py = g.y0 + row * g.mw;
      var cx = px + g.mw * 3.5, cy = py + g.mw * 3.5;
      ctx.fillStyle = "#fff";
      ctx.fillRect(px - 1, py - 1, g.mw * 7 + 2, g.mw * 7 + 2);
      ctx.fillStyle = "#111";
      ctx.beginPath(); ctx.arc(cx, cy, g.mw * 3.4, 0, 6.3); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(cx, cy, g.mw * 2.45, 0, 6.3); ctx.fill();
      ctx.fillStyle = "#111";
      ctx.beginPath(); ctx.arc(cx, cy, g.mw * 1.4, 0, 6.3); ctx.fill();
    }
    dot(0, 0); dot(g.n - 7, 0); dot(0, g.n - 7);
  }
  function draw(text) {
    box.innerHTML = "";
    var ok = false, levels = ["H", "Q", "M", "L"];
    for (var i = 0; i < levels.length; i++) {
      try {
        box.innerHTML = "";
        new QRCode(box, { text: text, width: 640, height: 640, colorDark: "#111", colorLight: "#fff", correctLevel: QRCode.CorrectLevel[levels[i]] });
        ok = true; break;
      } catch (e) { box.innerHTML = ""; }
    }
    if (!ok) { say("This text is too long for a QR code."); stage.classList.remove("show"); return; }
    var img = box.querySelector("img"); if (img) img.remove();
    var canvas = box.querySelector("canvas");
    grid = canvas ? measure(canvas) : null;
    if (canvas) pngUrl = canvas.toDataURL("image/png");
    say("");
    stage.classList.add("show");
    refreshLink();
  }
  function svg() {
    if (!grid) return "";
    var n = grid.n, pad = 4, size = n + 8;
    var rects = grid.cells.map(function (p) {
      return '<rect x="' + (p[0] + pad) + '" y="' + (p[1] + pad) + '" width="1" height="1"/>';
    }).join("");
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '"><rect width="100%" height="100%" fill="#fff"/><g fill="#111">' + rects + "</g></svg>";
  }
  input.value = localStorage.getItem(KEY) || "";
  count.textContent = input.value.length ? input.value.length + " / 2000" : "";
  input.oninput = function () {
    localStorage.setItem(KEY, input.value);
    count.textContent = input.value.length ? input.value.length + " / 2000" : "";
  };
  document.getElementById("w-clear").onclick = function () {
    input.value = ""; localStorage.removeItem(KEY); count.textContent = ""; stage.classList.remove("show"); box.innerHTML = ""; pngUrl = ""; grid = null; arm("", "qr.png"); say("");
  };
  go.onclick = function () {
    var text = input.value.trim();
    if (!text) { say("Write something first."); return; }
    if (text.length > 2000) { say("Keep it under 2000 characters."); return; }
    draw(text);
  };
  box.onclick = function () {
    if (!pngUrl) return;
    zoomImg.src = pngUrl;
    zoom.hidden = false;
    zoom.classList.add("open");
  };
  function shutZoom() {
    zoom.classList.remove("open");
    zoom.hidden = true;
  }
  document.getElementById("zoomX").onclick = function (e) { e.stopPropagation(); shutZoom(); };
  zoom.onclick = function (e) { if (e.target === zoom) shutZoom(); };
  document.getElementById("w-close").onclick = function () { stage.classList.remove("show"); };
  document.getElementById("w-png").onclick = function () { fmt = "png"; this.classList.add("on"); document.getElementById("w-svg").classList.remove("on"); refreshLink(); };
  document.getElementById("w-svg").onclick = function () { fmt = "svg"; this.classList.add("on"); document.getElementById("w-png").classList.remove("on"); refreshLink(); };
  document.getElementById("w-save").onclick = function (e) {
    if (!this.getAttribute("href")) { e.preventDefault(); say("Create a code first."); }
  };
})();
