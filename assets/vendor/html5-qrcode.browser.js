(function () {
  function exposeHtml5Qrcode() {
    var lib = window.__Html5QrcodeLibrary__;

    if (!lib && typeof __Html5QrcodeLibrary__ !== 'undefined') {
      lib = __Html5QrcodeLibrary__;
      window.__Html5QrcodeLibrary__ = lib;
    }

    if (!lib || !lib.Html5Qrcode) return false;

    window.Html5Qrcode = window.Html5Qrcode || lib.Html5Qrcode;
    window.Html5QrcodeScanner = window.Html5QrcodeScanner || lib.Html5QrcodeScanner;
    window.Html5QrcodeSupportedFormats = window.Html5QrcodeSupportedFormats || lib.Html5QrcodeSupportedFormats;
    window.Html5QrcodeScannerState = window.Html5QrcodeScannerState || lib.Html5QrcodeScannerState;
    window.Html5QrcodeScanType = window.Html5QrcodeScanType || lib.Html5QrcodeScanType;
    window.dispatchEvent(new Event('html5-qrcode-ready'));
    return true;
  }

  if (exposeHtml5Qrcode()) return;

  window.addEventListener('load', function () {
    if (!exposeHtml5Qrcode()) {
      window.dispatchEvent(new Event('html5-qrcode-error'));
    }
  }, { once: true });
})();
