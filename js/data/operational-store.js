import { profilesRepository } from "./profiles-repository.js?v=20260817-campos-escritura";
import { clientsRepository } from "./clients-repository.js?v=20260817-campos-escritura";
import { salesRepository } from "./sales-repository.js?v=20260817-campos-escritura";
import { ledgerRepository } from "./ledger-repository.js?v=20260817-campos-escritura";
import { cashRepository } from "./cash-repository.js?v=20260817-campos-escritura";
import { inventoryRepository } from "./inventory-repository.js?v=20260817-campos-escritura";
import { roundsRepository } from "./rounds-repository.js?v=20260817-campos-escritura";
import { suppliesRepository } from "./supplies-repository.js?v=20260817-campos-escritura";
import { settingsRepository } from "./settings-repository.js?v=20260817-campos-escritura";
import { reportsRepository } from "./reports-repository.js?v=20260817-campos-escritura";
import { maintenanceRepository } from "./maintenance-repository.js?v=20260817-campos-escritura";
import { returnsRepository } from "./returns-repository.js?v=20260817-campos-escritura";
import { correctionsRepository } from "./corrections-repository.js?v=20260817-campos-escritura";

const fromCents = (value) => Number(value || 0) / 100;
const locationKey = (row) =>
  ({
    "local:full": "local",
    "local:empty": "empty_local",
    "wash:empty": "lavado",
    "route_1:full": "ruta1",
    "route_1:empty": "empty_ruta1",
    "route_2:full": "ruta2",
    "route_2:empty": "empty_ruta2",
    "damaged:damaged": "danados",
  })[`${row.location_code}:${row.container_type}`];

function changed(before, after) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

function added(before, after) {
  const ids = new Set(before.map((item) => item.id));
  return after.filter((item) => !ids.has(item.id));
}

function removed(before, after) {
  const ids = new Set(after.map((item) => item.id));
  return before.filter((item) => !ids.has(item.id));
}

function changedItem(before, after) {
  return after.find((item) => {
    const old = before.find((candidate) => candidate.id === item.id);
    return old && changed(old, item);
  });
}

export class OperationalStore {
  constructor() {
    this.profile = null;
    this.lastProjection = null;
  }

  async load(baseState = {}) {
    const [
      profile,
      profiles,
      clients,
      sales,
      saleCorrections,
      saleReturns,
      saleCashAdjustments,
      payments,
      ledger,
      cashSessions,
      cashMovements,
      expenses,
      locations,
      inventoryMovements,
      rounds,
      supplies,
      supplyMovements,
      maintenance,
      settings,
      audit,
    ] = await Promise.all([
      profilesRepository.current(),
      profilesRepository.list(),
      clientsRepository.list(),
      salesRepository.list(),
      correctionsRepository.list(),
      returnsRepository.list(),
      correctionsRepository.listCashAdjustments(),
      ledgerRepository.listPayments(),
      ledgerRepository.listEntries(),
      cashRepository.listSessions(),
      cashRepository.listMovements(),
      cashRepository.listExpenses(),
      inventoryRepository.listLocations(),
      inventoryRepository.listMovements(),
      roundsRepository.list(),
      suppliesRepository.list(),
      suppliesRepository.listMovements(),
      maintenanceRepository.list(),
      settingsRepository.list(),
      reportsRepository.listAudit(),
    ]);
    if (!profile?.active)
      throw new Error("La cuenta no tiene un perfil operativo activo.");
    this.profile = profile;
    const clientMap = new Map(clients.map((item) => [item.id, item]));
    const paymentMap = new Map(payments.map((item) => [item.id, item]));
    const cashSessionMap = new Map(cashSessions.map((item) => [item.id, item]));
    const returnsBySale = new Map();
    saleReturns.forEach((item) => {
      const totals = returnsBySale.get(item.sale_id) || { qty: 0, total: 0, refund: 0, credit: 0 };
      totals.qty += Number(item.quantity);
      totals.total += Number(item.total_cents);
      totals.refund += Number(item.refund_cents);
      totals.credit += Number(item.credit_reversal_cents);
      returnsBySale.set(item.sale_id, totals);
    });
    const reloadsByRound = new Map();
    inventoryMovements
      .filter(
        (item) =>
          item.round_id &&
          item.movement_type === "round_reload" &&
          item.container_type === "full",
      )
      .forEach((item) => {
        reloadsByRound.set(
          item.round_id,
          (reloadsByRound.get(item.round_id) || 0) + Number(item.quantity),
        );
      });
    const netSoldByRound = new Map();
    sales
      .filter((sale) => sale.round_id && sale.status === "active")
      .forEach((sale) => {
        const netQuantity =
          Number(sale.quantity) - (returnsBySale.get(sale.id)?.qty || 0);
        netSoldByRound.set(
          sale.round_id,
          (netSoldByRound.get(sale.round_id) || 0) + netQuantity,
        );
      });
    const correctionByOriginal = new Map(
      saleCorrections.map((item) => [item.original_sale_id, item]),
    );
    const settingsMap = Object.fromEntries(
      settings.map((item) => [item.key, item.value]),
    );
    const lastMaintenanceServiceAt = maintenance
      .filter((item) => item.event_type === "service")
      .reduce(
        (latest, item) =>
          !latest || item.created_at > latest ? item.created_at : latest,
        null,
      );
    const maintenanceNetSalesCount = sales
      .filter(
        (sale) =>
          sale.status === "active" &&
          (!lastMaintenanceServiceAt ||
            sale.created_at > lastMaintenanceServiceAt),
      )
      .reduce(
        (sum, sale) =>
          sum +
          Math.max(
            0,
            Number(sale.quantity) -
              Number(returnsBySale.get(sale.id)?.qty || 0),
          ),
        0,
      );
    const inventory = {
      local: 0,
      ruta1: 0,
      ruta2: 0,
      empty_local: 0,
      empty_ruta1: 0,
      empty_ruta2: 0,
      lavado: 0,
      danados: 0,
    };
    locations.forEach((item) => {
      const key = locationKey(item);
      if (key) inventory[key] = Number(item.quantity);
    });
    const locationIdMap = new Map(
      locations.map((item) => [item.id, locationKey(item)]),
    );
    const cashTransferGroups = new Map();
    cashMovements
      .filter((item) => item.reference_type === "cash_transfer")
      .forEach((item) => {
        const group = cashTransferGroups.get(item.reference_id) || {};
        group[item.direction] = item;
        cashTransferGroups.set(item.reference_id, group);
      });
    const projectedCashTransfers = [...cashTransferGroups.entries()]
      .filter(([, group]) => group.in && group.out)
      .map(([id, group]) => ({
        id,
        date: group.out.created_at,
        fromCashSessionId: group.out.cash_session_id,
        toCashSessionId: group.in.cash_session_id,
        fromCenter: cashSessionMap.get(group.out.cash_session_id)?.center,
        toCenter: cashSessionMap.get(group.in.cash_session_id)?.center,
        amount: fromCents(group.out.amount_cents),
        deliveredBy: group.out.user_id,
        receivedBy: cashSessionMap.get(group.in.cash_session_id)?.user_id,
        notes: "Entrega interna central",
      }));
    const projectedInventoryMovements = inventoryMovements.flatMap((item) => {
      const common = {
        id: item.id,
        date: item.created_at,
        type: item.movement_type,
        userId: item.user_id,
        roundId: item.round_id,
        emptyReturnQty: Number(item.empty_return_quantity ?? item.quantity),
        damagedReturnQty: Number(item.damaged_return_quantity || 0),
        referenceId: item.reference_id,
      };
      const from = locationIdMap.get(item.from_location_id);
      const to = locationIdMap.get(item.to_location_id);
      return [
        ...(from
          ? [
              {
                ...common,
                id: `${item.id}:out`,
                location: from,
                delta: -Number(item.quantity),
                otherLocation: to || null,
              },
            ]
          : []),
        ...(to
          ? [
              {
                ...common,
                id: `${item.id}:in`,
                location: to,
                delta: Number(item.quantity),
                otherLocation: from || null,
              },
            ]
          : []),
      ];
    });
    const localUsers = Array.isArray(baseState.users) ? baseState.users : [];
    const users = profiles.map((item) => {
      const localUser =
        localUsers.find((user) => user.id === item.id) ||
        localUsers.find(
          (user) =>
            String(user.username || "").toLowerCase() ===
            String(item.username || "").toLowerCase(),
        ) ||
        (item.role === "administrador"
          ? localUsers.find((user) => user.role === "administrador")
          : null);
      return {
        id: item.id,
        name: item.name,
        username: item.username,
        role: item.role,
        center: item.center,
        route: item.route,
        permissions: item.permissions || [],
        active: item.active,
        pinConfigured: Boolean(item.pin_configured),
        pin: item.pin_configured ? "" : localUser?.pin || "",
      };
    });
    const projection = {
      ...baseState,
      version: 6,
      central: true,
      users,
      activeUserId: profile.id,
      clients: clients.map((item) => ({
        id: item.id,
        name: item.name,
        phone: item.phone,
        address: item.address,
        route: item.normal_route,
        type: item.client_type === "special" ? "Especial" : "Hogar",
        price:
          item.special_price_cents == null
            ? null
            : fromCents(item.special_price_cents),
        frequent: true,
        active: item.active,
        notes: item.notes,
        containerDebt: Number(item.container_debt || 0),
        version: item.version,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      })),
      sales: sales.map((item) => ({
        id: item.id,
        folio: item.folio,
        date: item.occurred_at,
        clientId: item.client_id,
        clientName: clientMap.get(item.client_id)?.name || "Público general",
        channel: item.channel,
        qty: item.quantity,
        emptyReturnQty: item.empty_return_quantity ?? item.quantity,
        damagedReturnQty: item.damaged_return_quantity || 0,
        price: fromCents(item.unit_price_cents),
        unitPrice: fromCents(item.unit_price_cents),
        total: fromCents(item.total_cents),
        paid: fromCents(item.paid_cents),
        credit: fromCents(item.credit_cents),
        paymentType: item.payment_method,
        notes: item.notes,
        userId: item.user_id,
        center: item.route || "local",
        status:
          item.status === "corrected"
            ? "superseded"
            : item.status === "voided"
              ? "void"
              : item.status,
        cashSessionId: item.cash_session_id,
        cashAccounting: item.cash_accounting || "normal",
        correctedAt: correctionByOriginal.get(item.id)?.created_at || null,
        voidedAt:
          correctionByOriginal.get(item.id)?.correction_type === "void"
            ? correctionByOriginal.get(item.id)?.created_at
            : null,
        roundId: item.round_id,
        originalSaleId: item.original_sale_id,
        returnedQty: returnsBySale.get(item.id)?.qty || 0,
        returnedTotal: fromCents(returnsBySale.get(item.id)?.total || 0),
        returnedPaid: fromCents(returnsBySale.get(item.id)?.refund || 0),
        returnedCredit: fromCents(returnsBySale.get(item.id)?.credit || 0),
      })),
      returns: saleReturns.map((item) => ({
        id: item.id,
        date: item.created_at,
        saleId: item.sale_id,
        clientId: sales.find((sale) => sale.id === item.sale_id)?.client_id || null,
        qty: Number(item.quantity),
        total: fromCents(item.total_cents),
        refundAmount: fromCents(item.refund_cents),
        cashRefund: item.refund_method === "efectivo" ? fromCents(item.refund_cents) : 0,
        creditReversal: fromCents(item.credit_reversal_cents),
        refundMethod: item.refund_method,
        reason: item.reason,
        userId: item.user_id,
        cashSessionId: item.cash_session_id,
      })),
      saleCorrections: saleCorrections.map((item) => ({
        id: item.id,
        folio: item.folio,
        date: item.created_at,
        originalSaleId: item.original_sale_id,
        newSaleId: item.replacement_sale_id,
        reason: item.reason,
        userId: item.created_by,
        type: item.correction_type,
      })),
      ledger: ledger.map((item) => {
        const payment = item.payment_id
          ? paymentMap.get(item.payment_id)
          : null;
        const isPayment = item.entry_type === "payment" || Number(item.amount_cents) < 0;
        return {
          id: item.id,
          folio: payment?.folio || "",
          date: payment?.occurred_at || item.created_at,
          clientId: item.client_id,
          type: isPayment ? "payment" : item.entry_type,
          label: item.reason || (isPayment ? "Pago / abono" : "Venta fiada"),
          qty: 0,
          charge: isPayment ? 0 : fromCents(Math.max(0, item.amount_cents)),
          payment: isPayment ? fromCents(Math.abs(item.amount_cents)) : 0,
          method: payment?.payment_method || "",
          notes: payment?.notes || item.reason,
          userId: item.created_by,
          cashSessionId: payment?.cash_session_id || null,
          saleId: item.sale_id,
          paymentId: item.payment_id,
        };
      }),
      expenses: expenses.map((item) => ({
        id: item.id,
        date: item.occurred_at,
        concept: item.concept,
        amount: fromCents(item.amount_cents),
        center: item.center,
        method: item.payment_method,
        affectsCash: item.affects_cash,
        notes: item.notes,
        userId: item.user_id,
        cashSessionId: item.cash_session_id,
      })),
      cashSessions: cashSessions.map((item) => ({
        id: item.id,
        userId: item.user_id,
        center: item.center,
        openedAt: item.opened_at,
        openingAmount: fromCents(item.opening_cents),
        closedAt: item.closed_at,
        expectedAmount:
          item.expected_cents == null ? null : fromCents(item.expected_cents),
        countedAmount:
          item.counted_cents == null ? null : fromCents(item.counted_cents),
        difference:
          item.difference_cents == null
            ? null
            : fromCents(item.difference_cents),
        differenceReason: item.difference_reason || "",
        status: item.status === "open" ? "abierta" : "cerrada",
      })),
      cashMovements: cashMovements
        .filter((item) => item.reference_type === "manual")
        .map((item) => ({
          id: item.id,
          date: item.created_at,
          cashSessionId: item.cash_session_id,
          type: item.direction === "in" ? "income" : "withdrawal",
          amount: fromCents(item.amount_cents),
          reason: item.movement_type,
          userId: item.user_id,
        })),
      cashTransfers: projectedCashTransfers,
      cashAdjustments: saleCashAdjustments.filter((item) => item.post_close).map((item) => ({
        id: item.id,
        date: item.created_at,
        correctionId: item.correction_id,
        saleId: item.sale_id,
        cashSessionId: item.original_cash_session_id,
        appliedCashSessionId: item.applied_cash_session_id,
        amount: fromCents(item.amount_cents),
        reason: item.reason,
        userId: item.user_id,
        postClose: item.post_close,
      })),
      inventory,
      inventoryMovements: projectedInventoryMovements,
      rounds: rounds.map((item) => ({
        id: item.id,
        number: item.round_number,
        route: item.route,
        startedAt: item.started_at,
        returnedAt: item.returned_at,
        endedAt: item.closed_at,
        closedBy: item.closed_by,
        userId: item.user_id,
        loadedQty: item.loaded_full_qty,
        reloadQty: reloadsByRound.get(item.id) || 0,
        totalLoadedQty:
          Number(item.loaded_full_qty) + (reloadsByRound.get(item.id) || 0),
        returnedEmptyQty: item.returned_empty_qty || 0,
        returnedFullQty: item.returned_full_qty || 0,
        damagedQty: item.damaged_qty || 0,
        lostQty: item.lost_qty || 0,
        soldQty: netSoldByRound.get(item.id) || 0,
        availableFullQty:
          Number(item.loaded_full_qty) +
          (reloadsByRound.get(item.id) || 0) -
          (netSoldByRound.get(item.id) || 0),
        inconsistencyQty:
          (netSoldByRound.get(item.id) || 0) >
          Number(item.loaded_full_qty) + (reloadsByRound.get(item.id) || 0)
            ? (netSoldByRound.get(item.id) || 0) -
              Number(item.loaded_full_qty) -
              (reloadsByRound.get(item.id) || 0)
            : 0,
        differenceQty: 0,
        notes: item.return_notes || "",
        recoveryReason: item.recovery_reason || "",
        status:
          item.status === "closed"
            ? "cerrada"
            : item.status === "returned"
              ? "regresada"
              : "en_ruta",
      })),
      supplies: supplies.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        unit: item.unit,
        currentStock: Number(item.current_stock),
        minimumStock: Number(item.minimum_stock),
        costPerUnit: fromCents(item.cost_cents),
        consumptionPerUnit: Number(item.consumption_per_unit),
        active: item.active,
        notes: "",
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      })),
      supplyMovements: supplyMovements.map((item) => ({
        id: item.id,
        date: item.created_at,
        supplyId: item.supply_id,
        type:
          item.movement_type === "consumption"
            ? "consume"
            : item.movement_type === "adjustment"
              ? "adjust"
              : item.movement_type,
        quantity: Number(item.quantity),
        costPerUnit: fromCents(item.unit_cost_cents),
        userId: item.user_id,
        reason: "",
      })),
      maintenance: {
        count: maintenanceNetSalesCount,
        history: maintenance
          .filter((item) => item.event_type === "service")
          .map((item) => ({
            id: item.id,
            date: item.created_at,
            previousCount: item.previous_count,
            userId: item.user_id,
          })),
      },
      settings: {
        ...(baseState.settings || {}),
        businessName: settingsMap.business?.name || "Purificadora Trujillo",
        defaultPrice: fromCents(
          settingsMap.pricing?.default_price_cents ?? 1400,
        ),
        maintenanceThreshold: Number(settingsMap.maintenance?.threshold ?? 375),
      },
      audit: audit.map((item) => ({
        id: item.id,
        timestamp: item.created_at,
        userId: item.user_id,
        userName: users.find((user) => user.id === item.user_id)?.name || "",
        action: item.action,
        entity: item.entity,
        entityId: item.entity_id,
        before: item.before_data,
        after: item.after_data,
        description: item.reason || item.action,
      })),
      activity: audit.slice(0, 100).map((item) => ({
        id: item.id,
        date: item.created_at,
        text: item.reason || item.action,
      })),
    };
    this.lastProjection = projection;
    return projection;
  }

  async commit(before, draft) {
    const newUsers = added(before.users || [], draft.users || []);
    const deletedUser = removed(before.users || [], draft.users || [])[0];
    const updatedUser = changedItem(before.users || [], draft.users || []);
    const previousUpdatedUser = updatedUser
      ? (before.users || []).find((item) => item.id === updatedUser.id)
      : null;
    const newClients = added(before.clients, draft.clients);
    const updatedClient = changedItem(before.clients, draft.clients);
    const containerReturnClient = draft.clients.find((item) => {
      const old = before.clients.find((candidate) => candidate.id === item.id);
      return (
        old &&
        Number(item.containerDebt || 0) < Number(old.containerDebt || 0)
      );
    });
    const newSales = added(before.sales, draft.sales);
    const newReturn = added(before.returns || [], draft.returns || [])[0];
    const newCorrection = added(before.saleCorrections || [], draft.saleCorrections || [])[0];
    const newCashAdjustment = added(before.cashAdjustments || [], draft.cashAdjustments || [])[0];
    const newLedger = added(before.ledger, draft.ledger).find(
      (item) => item.type === "payment",
    );
    const workDayClosed =
      Boolean(draft.workDayClosedAt) &&
      draft.workDayClosedAt !== before.workDayClosedAt;
    const newSessions = added(before.cashSessions, draft.cashSessions);
    const autoClosedSessions = draft.cashSessions.filter((item) => {
      const old = before.cashSessions.find(
        (candidate) => candidate.id === item.id,
      );
      return old && !old.closedAt && item.closedAt && item.autoClosedWorkDay;
    });
    const closedSession = draft.cashSessions.find((item) => {
      const old = before.cashSessions.find(
        (candidate) => candidate.id === item.id,
      );
      return old && !old.closedAt && item.closedAt && !item.autoClosedWorkDay;
    });
    const newCashMovement = added(before.cashMovements, draft.cashMovements)[0];
    const newCashTransfer = added(before.cashTransfers, draft.cashTransfers)[0];
    const newRounds = added(before.rounds, draft.rounds);
    const reloadedRound = draft.rounds.find((item) => {
      const old = before.rounds.find((candidate) => candidate.id === item.id);
      return old && Number(item.reloadQty || 0) > Number(old.reloadQty || 0);
    });
    const autoClosedRounds = draft.rounds.filter((item) => {
      const old = before.rounds.find((candidate) => candidate.id === item.id);
      return old && old.status !== "cerrada" && item.status === "cerrada" && item.autoClosedWorkDay;
    });
    const closedRound = draft.rounds.find((item) => {
      const old = before.rounds.find((candidate) => candidate.id === item.id);
      return old && old.status !== "cerrada" && item.status === "cerrada" && !item.autoClosedWorkDay;
    });
    const returnedRound = draft.rounds.find((item) => {
      const old = before.rounds.find((candidate) => candidate.id === item.id);
      return old && old.status === "en_ruta" && item.status === "regresada";
    });
    const newSupply = added(before.supplies, draft.supplies)[0];
    const updatedSupply = changedItem(before.supplies, draft.supplies);
    const newSupplyMovement = added(
      before.supplyMovements,
      draft.supplyMovements,
    )[0];
    const newExpense = added(before.expenses, draft.expenses)[0];
    const newMaintenance = added(
      before.maintenance?.history || [],
      draft.maintenance?.history || [],
    )[0];
    const newInventory = added(
      before.inventoryMovements,
      draft.inventoryMovements,
    );

    // El cierre de jornada no encaja en la cadena de una-rama-por-commit:
    // puede cerrar cajas Y rondas a la vez, y con todo cerrado no cambia nada.
    // Se atiende aparte y primero, identificado por su marca explicita.
    if (workDayClosed) {
      for (const session of autoClosedSessions)
        await cashRepository.close(session);
      for (const round of autoClosedRounds)
        await roundsRepository.finalize(round);
      // Cero elementos abiertos es un cierre valido, no un error.
    } else if (newUsers[0])
      await profilesRepository.save({ ...newUsers[0], id: null });
    else if (deletedUser) await profilesRepository.remove(deletedUser.id);
    else if (
      updatedUser &&
      previousUpdatedUser?.active !== updatedUser.active
    )
      await profilesRepository.setActive(updatedUser.id, updatedUser.active);
    else if (updatedUser) await profilesRepository.save(updatedUser);
    else if (newReturn) await returnsRepository.create(newReturn);
    else if (newCorrection?.type === "void")
      await correctionsRepository.void(
        newCorrection,
        newCashAdjustment?.appliedCashSessionId || null,
      );
    else if (newCorrection && newSales[0])
      await correctionsRepository.correct(
        newCorrection,
        newSales[0],
        newCashAdjustment?.appliedCashSessionId || newSales[0].cashSessionId || null,
      );
    else if (newSales[0]) await salesRepository.create(newSales[0]);
    else if (newLedger) await ledgerRepository.registerPayment(newLedger);
    else if (newClients[0]) await clientsRepository.create(newClients[0]);
    else if (containerReturnClient)
      await clientsRepository.returnContainers({
        clientId: containerReturnClient.id,
        quantity: containerReturnClient.lastContainerReturnQty,
        location: containerReturnClient.lastContainerReturnLocation,
        notes: containerReturnClient.lastContainerReturnNotes,
      });
    else if (updatedClient) await clientsRepository.update(updatedClient);
    else if (newSessions[0]) await cashRepository.open(newSessions[0]);
    else if (closedSession) await cashRepository.close(closedSession);
    else if (newCashMovement) await cashRepository.movement(newCashMovement);
    else if (newCashTransfer) await cashRepository.transfer(newCashTransfer);
    else if (reloadedRound) {
      const old = before.rounds.find((item) => item.id === reloadedRound.id);
      await roundsRepository.reload({
        id: reloadedRound.id,
        quantity:
          Number(reloadedRound.reloadQty || 0) - Number(old?.reloadQty || 0),
        notes: reloadedRound.lastReloadNotes || "",
      });
    }
    else if (returnedRound) await roundsRepository.registerReturn(returnedRound);
    else if (closedRound) await roundsRepository.finalize(closedRound);
    else if (newRounds[0]) await roundsRepository.start(newRounds[0]);
    else if (
      newSupplyMovement?.type === "production" ||
      newInventory.some((item) => item.type === "containers_filled")
    ) {
      const movement = newInventory.find(
        (item) => item.type === "containers_filled" && Number(item.delta) < 0,
      );
      await inventoryRepository.fill({
        quantity: Math.abs(Number(movement?.delta || 0)),
        notes: movement?.notes || "",
      });
    } else if (newSupply)
      await suppliesRepository.save(newSupply);
    else if (newSupplyMovement)
      await suppliesRepository.movement(newSupplyMovement);
    else if (updatedSupply) await suppliesRepository.save(updatedSupply);
    else if (newExpense) await cashRepository.createExpense(newExpense);
    else if (newMaintenance)
      await maintenanceRepository.register(newMaintenance);
    else if (newInventory.some((item) => item.type === "transferencia")) {
      const out = newInventory.find(
        (item) => item.type === "transferencia" && Number(item.delta) < 0,
      );
      await inventoryRepository.transfer({
        from: out.location,
        to: out.otherLocation,
        quantity: Math.abs(out.delta),
        reason: out.notes,
      });
    } else if (newInventory.some((item) => item.type === "ajuste")) {
      const item = newInventory.find((movement) => movement.type === "ajuste");
      await inventoryRepository.adjust({
        location: item.location,
        newQuantity: item.after,
        reason: item.notes,
      });
    } else if (changed(before.settings, draft.settings))
      await settingsRepository.save(draft.settings);
    else
      throw new Error(
        "Esta operación todavía no tiene un comando central seguro. No se guardó ningún cambio.",
      );

    return this.load(before);
  }
}
