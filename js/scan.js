(function () {
  var file = document.getElementById("s-file");
  var label = document.getElementById("s-label");
  var go = document.getElementById("s-go");
  var err = document.getElementById("s-err");
  var stage = document.getElementById("s-stage");
  var out = document.getElementById("s-out");
  var dataUrl = "";
  var KEY = "kanba.scan";

  function say(msg) { err.textContent = msg || ""; }

  function decode(url) {
    var img = new Image();
    img.onload = function () {
      var c = document.createElement("canvas");
      var scale = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      var ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, c.width, c.height);
      var px = ctx.getImageData(0, 0, c.width, c.height);
      var code = window.jsQR(px.data, c.width, c.height);
      if (!code) { say("No QR found in that image."); stage.classList.remove("show"); return; }
      out.value = code.data;
      localStorage.setItem(KEY, code.data);
      var link = document.getElementById("s-save");
      link.href = URL.createObjectURL(new Blob([code.data], { type: "text/plain;charset=utf-8" }));
      link.download = "qr.txt";
      say("");
      stage.classList.add("show");
    };
    img.onerror = function () { say("Could not read that image."); };
    img.src = url;
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
    if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) { say("Use a PNG, JPG, WEBP, or GIF."); return; }
    label.textContent = f.name;
    label.parentElement.classList.add("has");
    var reader = new FileReader();
    reader.onload = function () { dataUrl = reader.result; say(""); };
    reader.readAsDataURL(f);
  };
  document.getElementById("s-clear").onclick = function () {
    file.value = ""; dataUrl = ""; label.textContent = "Choose a QR image";
    label.parentElement.classList.remove("has");
  };
  document.getElementById("s-close").onclick = function () {
    out.value = ""; localStorage.removeItem(KEY); stage.classList.remove("show");
    document.getElementById("s-save").removeAttribute("href");
  };
  go.onclick = function () {
    if (!dataUrl) { say("Choose a QR image."); return; }
    decode(dataUrl);
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
