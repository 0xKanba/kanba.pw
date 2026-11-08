(function () {
  var input = document.getElementById("qrInput");
  var file = document.getElementById("qrFile");
  var fileLabel = document.getElementById("fileLabel");
  var go = document.getElementById("go");
  var err = document.getElementById("err");
  var inLayer = document.getElementById("inLayer");
  var outLayer = document.getElementById("outLayer");
  var box = document.getElementById("qrcode");
  var decoded = document.getElementById("decoded");
  var copyOut = document.getElementById("copyOut");
  var back = document.getElementById("back");
  var zoom = document.getElementById("zoom");
  var zoomImg = document.getElementById("zoomImg");
  var zoomClose = document.getElementById("zoomClose");
  var lastText = "";
  var allowed = ["image/png", "image/jpeg", "image/webp", "image/gif"];

  function fail(msg) {
    err.hidden = !msg;
    err.textContent = msg || "";
  }

  function showOut(mode) {
    var narrow = window.matchMedia("(max-width: 859px)").matches;
    if (narrow) inLayer.hidden = true;
    outLayer.hidden = false;
    box.hidden = mode !== "qr";
    decoded.hidden = mode !== "text";
    copyOut.hidden = mode !== "text";
  }

  function openZoom() {
    var canvas = box.querySelector("canvas");
    if (!canvas) return;
    zoomImg.src = canvas.toDataURL("image/png");
    zoom.hidden = false;
  }

  function closeZoom() {
    zoom.hidden = true;
    zoomImg.removeAttribute("src");
  }

  function make() {
    fail("");
    var text = input.value.trim();
    var imgFile = file.files && file.files[0];

    if (imgFile) {
      if (allowed.indexOf(imgFile.type) === -1) {
        fail("Use a PNG, JPG, WEBP, or GIF.");
        file.value = "";
        fileLabel.textContent = "Choose a QR image";
        file.parentElement.classList.remove("has-file");
        return;
      }
      readImage(imgFile);
      return;
    }
    if (!text) {
      fail("Type text or choose a QR image.");
      return;
    }
    box.innerHTML = "";
    new QRCode(box, {
      text: text,
      width: 640,
      height: 640,
      colorDark: "#111111",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });
    showOut("qr");
  }

  function readImage(imgFile) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement("canvas");
        var max = 1200;
        var w = img.naturalWidth;
        var h = img.naturalHeight;
        var scale = Math.min(1, max / Math.max(w, h));
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        var ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        var pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var code = window.jsQR(pixels.data, canvas.width, canvas.height);
        if (!code) {
          fail("No QR found in that image.");
          return;
        }
        lastText = code.data;
        decoded.textContent = lastText;
        showOut("text");
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(imgFile);
  }

  file.addEventListener("change", function () {
    var f = file.files && file.files[0];
    if (!f) {
      fileLabel.textContent = "Choose a QR image";
      file.parentElement.classList.remove("has-file");
      return;
    }
    fileLabel.textContent = f.name;
    file.parentElement.classList.add("has-file");
  });

  go.addEventListener("click", make);
  box.addEventListener("click", openZoom);
  zoom.addEventListener("click", function (e) {
    if (e.target === zoom || e.target === zoomClose) closeZoom();
  });
  zoomClose.addEventListener("click", closeZoom);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeZoom();
  });

  copyOut.addEventListener("click", function () {
    if (!lastText) return;
    navigator.clipboard.writeText(lastText).then(function () {
      copyOut.textContent = "Copied";
      setTimeout(function () { copyOut.textContent = "Copy"; }, 1200);
    });
  });

  back.addEventListener("click", function () {
    inLayer.hidden = false;
    outLayer.hidden = true;
    closeZoom();
    fail("");
  });
})();
