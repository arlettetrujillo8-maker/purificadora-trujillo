(function exposeSaleClientSelection(root) {
  "use strict";

  const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function createSaleClientSelection() {
    let selectedClientId = null;
    let selectedClient = null;

    return {
      get clientId() {
        return selectedClientId;
      },
      get client() {
        return selectedClient;
      },
      select(client) {
        if (!client || !UUID_PATTERN.test(String(client.id || ""))) {
          selectedClientId = null;
          selectedClient = null;
          return null;
        }
        selectedClientId = client.id;
        selectedClient = client;
        return selectedClient;
      },
      resolve(clients) {
        if (!selectedClientId) return null;
        const current = (clients || []).find(
          (client) =>
            client.id === selectedClientId && client.active !== false,
        );
        if (!current) {
          selectedClientId = null;
          selectedClient = null;
          return null;
        }
        selectedClient = current;
        return selectedClient;
      },
      clear() {
        selectedClientId = null;
        selectedClient = null;
      },
    };
  }

  const api = { createSaleClientSelection };
  root.PurificadoraSaleClientSelection = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
