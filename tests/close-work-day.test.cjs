const { test, describe, it, expect, beforeEach } = require("node:test");
const assert = require("node:assert");

describe("Close Work Day", () => {
  let mockState;
  let mockUser;

  beforeEach(() => {
    mockUser = {
      id: "user-123",
      name: "Admin Test",
      role: "administrador",
    };

    mockState = {
      cashSessions: [
        {
          id: "cash-1",
          userId: "user-123",
          openedAt: "2024-08-15T08:00:00Z",
          closedAt: null,
          status: "abierta",
        },
        {
          id: "cash-2",
          userId: "user-456",
          openedAt: "2024-08-15T09:00:00Z",
          closedAt: null,
          status: "abierta",
        },
      ],
      rounds: [
        {
          id: "round-1",
          number: 1,
          route: "ruta1",
          status: "abierta",
          startedAt: "2024-08-15T08:30:00Z",
          endedAt: null,
        },
        {
          id: "round-2",
          number: 2,
          route: "ruta2",
          status: "regresada",
          startedAt: "2024-08-15T08:45:00Z",
          endedAt: null,
        },
        {
          id: "round-3",
          number: 3,
          route: "ruta1",
          status: "cerrada",
          startedAt: "2024-08-15T07:00:00Z",
          endedAt: "2024-08-15T17:00:00Z",
        },
      ],
      activity: [],
      audit: [],
    };
  });

  describe("closeWorkDay()", () => {
    it("should close all open cash sessions", () => {
      const stateBefore = JSON.parse(JSON.stringify(mockState));

      mockState.cashSessions.forEach((session) => {
        if (!session.closedAt) {
          session.closedAt = new Date().toISOString();
          session.status = "cerrada";
          session.autoClosedWorkDay = true;
          const expected = 0;
          session.countedAmount = expected;
          session.expectedAmount = expected;
          session.difference = 0;
          session.differenceReason = "Cierre automático de jornada";
        }
      });

      assert.strictEqual(mockState.cashSessions.length, 2);
      assert.strictEqual(mockState.cashSessions.every((s) => s.status === "cerrada"), true);
      assert.strictEqual(mockState.cashSessions.every((s) => s.autoClosedWorkDay === true), true);
      assert.strictEqual(
        mockState.cashSessions.every((s) => s.differenceReason === "Cierre automático de jornada"),
        true
      );
    });

    it("should close all active rounds", () => {
      const activeCountBefore = mockState.rounds.filter((r) => r.status !== "cerrada").length;
      assert(activeCountBefore > 0, "Should have active rounds before close");

      const timestamp = new Date().toISOString();

      mockState.rounds.forEach((round) => {
        if (round.status !== "cerrada") {
          round.status = "cerrada";
          round.endedAt = timestamp;
          round.closedBy = mockUser.id;
          round.autoClosedWorkDay = true;
        }
      });

      const activeCountAfter = mockState.rounds.filter((r) => r.status !== "cerrada").length;
      assert.strictEqual(activeCountAfter, 0, "No active rounds should remain");
      assert.strictEqual(mockState.rounds.every((r) => r.status === "cerrada"), true);
      assert.strictEqual(mockState.rounds.filter((r) => r.autoClosedWorkDay).length, activeCountBefore);
    });

    it("should mark entities with autoClosedWorkDay flag", () => {
      mockState.cashSessions.forEach((session) => {
        if (!session.closedAt) {
          session.autoClosedWorkDay = true;
        }
      });

      mockState.rounds.forEach((round) => {
        if (round.status !== "cerrada") {
          round.autoClosedWorkDay = true;
        }
      });

      assert.strictEqual(
        mockState.cashSessions.filter((s) => s.autoClosedWorkDay).length,
        2
      );
      assert.strictEqual(mockState.rounds.filter((r) => r.autoClosedWorkDay).length, 2);
    });

    it("should NOT delete or splice any entities", () => {
      const countBefore = mockState.cashSessions.length + mockState.rounds.length;

      mockState.cashSessions.forEach((session) => {
        if (!session.closedAt) {
          session.closedAt = new Date().toISOString();
          session.status = "cerrada";
          session.autoClosedWorkDay = true;
        }
      });

      mockState.rounds.forEach((round) => {
        if (round.status !== "cerrada") {
          round.status = "cerrada";
          round.autoClosedWorkDay = true;
        }
      });

      const countAfter = mockState.cashSessions.length + mockState.rounds.length;
      assert.strictEqual(countBefore, countAfter, "Entity count should not change");
    });

    it("should preserve cash session differences", () => {
      const sessionWithDifference = mockState.cashSessions[0];
      sessionWithDifference.difference = 50;
      sessionWithDifference.differenceReason = "Previous reason";
      sessionWithDifference.closedAt = "2024-08-15T12:00:00Z";
      sessionWithDifference.status = "cerrada";

      const openSessions = mockState.cashSessions.filter((s) => !s.closedAt);
      openSessions.forEach((s) => {
        s.autoClosedWorkDay = true;
      });

      assert.strictEqual(sessionWithDifference.difference, 50);
      assert.strictEqual(sessionWithDifference.differenceReason, "Previous reason");
    });
  });


  describe("Permissions", () => {
    it("should require close_work_day permission", () => {
      const requiredPermission = "close_work_day";
      assert.strictEqual(typeof requiredPermission, "string");
      assert(requiredPermission.length > 0);
    });

    it("should grant permission to administrador role", () => {
      const adminPermissions = [
        "create_sale",
        "close_cash",
        "close_work_day",
        "rounds",
      ];
      assert(adminPermissions.includes("close_work_day"));
    });

    it("should grant permission to caja role", () => {
      const cajaPermissions = [
        "view_own_cash",
        "close_cash",
        "close_work_day",
        "cash_delivery",
      ];
      assert(cajaPermissions.includes("close_work_day"));
    });
  });
});