(function exposeSafeUuid(globalScope) {
  "use strict";

  function safeRandomUUID(cryptoSource = globalScope.crypto) {
    if (typeof cryptoSource?.randomUUID === "function")
      return cryptoSource.randomUUID();

    if (typeof cryptoSource?.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      cryptoSource.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = [...bytes].map((byte) =>
        byte.toString(16).padStart(2, "0"),
      );
      return [
        hex.slice(0, 4).join(""),
        hex.slice(4, 6).join(""),
        hex.slice(6, 8).join(""),
        hex.slice(8, 10).join(""),
        hex.slice(10, 16).join(""),
      ].join("-");
    }

    throw new Error("No hay generador criptográfico disponible");
  }

  const api = Object.freeze({ safeRandomUUID });
  globalScope.PurificadoraCrypto = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
