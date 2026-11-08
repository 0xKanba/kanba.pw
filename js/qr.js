(function () {
  const input = document.getElementById("qrInput");
  const sizeEl = document.getElementById("qrSize");
  const levelEl = document.getElementById("qrLevel");
  const darkEl = document.getElementById("qrDark");
  const lightEl = document.getElementById("qrLight");
  const card = document.querySelector(".card");
  const empty = document.getElementById("qrEmpty");
  const count = document.getElementById("qrCount");
  const status = document.getElementById("qrStatus");
  const downloadBtn = document.getElementById("qrDownload");
  const copyBtn = document.getElementById("qrCopy");
  const clearBtn = document.getElementById("qrClear");
  const pasteBtn = document.getElementById("qrPaste");

  let timer = 0;

  function setStatus(text) {
    status.textContent = text || "";
  }

  function render() {
    const text = input.value.trim();
    count.textContent = input.value.length + " chars";
    box.innerHTML = "";

    if (!text) {
      empty.hidden = false;
      card.hidden = true;
      downloadBtn.disabled = true;
      copyBtn.disabled = true;
      setStatus("");
      return;
    }

    empty.hidden = true;
    card.hidden = false;
    const size = Number(sizeEl.value) || 280;

    new QRCode(box, {
      text: text,
      width: size,
      height: size,
      colorDark: darkEl.value,
      colorLight: lightEl.value,
      correctLevel: QRCode.CorrectLevel[levelEl.value] || QRCode.CorrectLevel.M
    });

    downloadBtn.disabled = false;
    copyBtn.disabled = false;
    setStatus("Updated");
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(render, 120);
  }

  function canvas() {
    return box.querySelector("canvas");
  }

  downloadBtn.addEventListener("click", function () {
    const c = canvas();
    if (!c) return;
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = "qr.png";
    a.click();
  });

  copyBtn.addEventListener("click", async function () {
    const c = canvas();
    if (!c) return;
    try {
      const blob = await new Promise(function (resolve) {
        c.toBlob(resolve, "image/png");
      });
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setStatus("Copied image");
    } catch (err) {
      try {
        await navigator.clipboard.writeText(input.value.trim());
        setStatus("Copied text");
      } catch (e) {
        setStatus("Copy blocked by the browser");
      }
    }
  });

  clearBtn.addEventListener("click", function () {
    input.value = "";
    render();
    input.focus();
  });

  pasteBtn.addEventListener("click", async function () {
    try {
      input.value = await navigator.clipboard.readText();
      render();
    } catch (err) {
      setStatus("Paste permission denied");
    }
  });

  input.addEventListener("input", schedule);
  sizeEl.addEventListener("input", schedule);
  levelEl.addEventListener("change", schedule);
  darkEl.addEventListener("input", schedule);
  lightEl.addEventListener("input", schedule);

  const params = new URLSearchParams(location.search);
  if (params.get("text")) input.value = params.get("text");
  render();
})();
