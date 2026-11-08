(function () {
  var input = document.getElementById("qrInput");
  var file = document.getElementById("qrFile");
  var go = document.getElementById("go");
  var err = document.getElementById("err");
  var inLayer = document.getElementById("inLayer");
  var outLayer = document.getElementById("outLayer");
  var box = document.getElementById("qrcode");
  var decoded = document.getElementById("decoded");
  var copyOut = document.getElementById("copyOut");
  var back = document.getElementById("back");
  var lastText = "";

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

  function make() {
    fail("");
    var text = input.value.trim();
    var imgFile = file.files && file.files[0];

    if (imgFile) {
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
      width: 320,
      height: 320,
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
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        var ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
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

  go.addEventListener("click", make);

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
    fail("");
  });
})();
