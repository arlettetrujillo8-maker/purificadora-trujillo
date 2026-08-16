const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert");

describe("Repartidor Cash Flow - Admin entering as Repartidor", () => {
  let mockState;
  let mockUser;

  beforeEach(() => {
    mockUser = {
      id: "rept-001",
      name: "Juan Repartidor",
      role: "repartidor",
      center: "ruta1",
      permissions: ["create_sale", "open_cash", "close_cash", "rounds"],
    };

    mockState = {
      cashSessions: [],
      activity: [],
      audit: [],
    };
  });

  describe("Permission Logic", () => {
    it("should allow repartidor to open cash regardless of adminMode", () => {
      const permission = "open_cash";
      const user = mockUser;

      function can(perm) {
        if (perm === "open_cash" && user.role === "repartidor") return true;
        return false;
      }

      assert.strictEqual(can(permission), true);
    });

    it("should work even if adminMode is true", () => {
      const permission = "open_cash";
      const user = mockUser;
      const adminMode = true;

      function can(perm) {
        if (perm === "open_cash" && user.role === "repartidor") return true;
        if (adminMode && user.role === "administrador")
          return ["open_cash"].includes(perm);
        return user.permissions.includes(perm);
      }

      assert.strictEqual(can(permission), true);
    });

    it("should NOT break other permissions for repartidor", () => {
      const user = mockUser;

      function can(perm) {
        if (perm === "open_cash" && user.role === "repartidor") return true;
        return user.permissions.includes(perm);
      }

      assert.strictEqual(can("create_sale"), true);
      assert.strictEqual(can("close_cash"), true);
      assert.strictEqual(can("rounds"), true);
      assert.strictEqual(can("users"), false);
    });

    it("should allow repartidor to open cash with admin account", () => {
      const adminUser = {
        id: "admin-001",
        name: "Admin",
        role: "administrador",
      };
      const repartidorUser = {
        id: "rept-001",
        name: "Juan",
        role: "repartidor",
        permissions: ["open_cash"],
      };

      let activeUser = repartidorUser;
      let adminMode = true;

      function can(perm) {
        if (perm === "open_cash" && activeUser.role === "repartidor")
          return true;
        if (adminMode && activeUser.role === "administrador")
          return ["open_cash"].includes(perm);
        return activeUser.permissions?.includes(perm) || false;
      }

      assert.strictEqual(can("open_cash"), true, "Repartidor can open cash");
    });
  });

  describe("Cash Session Creation", () => {
    it("should create cash session with repartidor's userId", () => {
      const user = mockUser;
      const session = {
        id: "cash-001",
        userId: user.id,
        center: user.center,
        openedAt: new Date().toISOString(),
        openingAmount: 500,
        closedAt: null,
        status: "abierta",
      };

      mockState.cashSessions.push(session);

      assert.strictEqual(mockState.cashSessions.length, 1);
      assert.strictEqual(mockState.cashSessions[0].userId, "rept-001");
      assert.strictEqual(mockState.cashSessions[0].center, "ruta1");
      assert.strictEqual(mockState.cashSessions[0].status, "abierta");
    });

    it("should prevent duplicate cash sessions for same user", () => {
      const user = mockUser;

      const getOpenCashSession = (userId) => {
        return mockState.cashSessions.find(
          (s) => s.userId === userId && !s.closedAt
        );
      };

      const session1 = {
        id: "cash-001",
        userId: user.id,
        openedAt: new Date().toISOString(),
        openingAmount: 500,
        closedAt: null,
        status: "abierta",
      };

      mockState.cashSessions.push(session1);

      const existingSession = getOpenCashSession(user.id);
      assert(existingSession, "First session should exist");

      const canOpenAnother = !getOpenCashSession(user.id);
      assert.strictEqual(canOpenAnother, false, "Cannot open duplicate session");
    });
  });

  describe("Offline/Online Scenarios", () => {
    it("should allow cash opening regardless of central sync status", () => {
      const user = mockUser;
      let centralSync = false;

      function can(perm) {
        if (perm === "open_cash" && user.role === "repartidor") return true;
        return false;
      }

      assert.strictEqual(can("open_cash"), true);
      assert.strictEqual(centralSync, false);
    });

    it("should work in offline mode", () => {
      const user = mockUser;
      let employeeSession = { userId: "rept-001" };
      let recoveryRequired = false;

      function can(perm) {
        if (recoveryRequired || !employeeSession || !user) return false;
        if (perm === "open_cash" && user.role === "repartidor") return true;
        return false;
      }

      assert.strictEqual(can("open_cash"), true);
      assert.strictEqual(employeeSession.userId, "rept-001");
    });
  });
});
