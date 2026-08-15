const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const repositoryUtils = fs.readFileSync(
  path.join(root, "js/data/repository-utils.js"),
  "utf8",
);
const bootstrap = fs.readFileSync(
  path.join(root, "js/v3/bootstrap.js"),
  "utf8",
);

assert.match(repositoryUtils, /await ensureCentralSession\(\);/);
assert.match(repositoryUtils, /await ensureCentralSession\(true\);/);
assert.match(repositoryUtils, /permission denied for function/i);
assert.match(repositoryUtils, /purificadora:central-auth-required/);
assert.match(
  repositoryUtils,
  /La sesión central venció\. Reconecta la cuenta para continuar\./,
);
assert.match(bootstrap, /addEventListener\(CENTRAL_AUTH_REQUIRED_EVENT/);
assert.match(bootstrap, /signOut\(\{ scope: "local" \}\)/);
assert.match(bootstrap, /emitCentralAccessState\(false, "session-expired"\)/);

function loadRpcWith(mockSupabase, events) {
  const executable = repositoryUtils
    .replace(/^import \{[\s\S]*?\} from "\.\/supabase-client\.js\?v=[^"]+";\s*/, "")
    .replaceAll("export ", "")
    .concat("\nglobalThis.__rpcUnderTest = rpc;");
  const context = {
    supabase: mockSupabase,
    getDeviceId: () => "00000000-0000-4000-8000-000000000001",
    CustomEvent: class CustomEvent {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    },
    window: { dispatchEvent: (event) => events.push(event) },
    console,
    Date,
    globalThis: null,
  };
  context.globalThis = context;
  vm.runInNewContext(executable, context);
  return context.__rpcUnderTest;
}

const validSession = {
  access_token: "test-access-token",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: "00000000-0000-4000-8000-000000000002" },
};

(async () => {
  const retryEvents = [];
  let rpcCalls = 0;
  let refreshCalls = 0;
  const retryRpc = loadRpcWith(
    {
      auth: {
        getSession: async () => ({ data: { session: validSession }, error: null }),
        refreshSession: async () => {
          refreshCalls += 1;
          return { data: { session: validSession }, error: null };
        },
      },
      rpc: async () => {
        rpcCalls += 1;
        return rpcCalls === 1
          ? {
              data: null,
              error: {
                code: "42501",
                message: "permission denied for function save_operator",
              },
            }
          : { data: { id: "operator-id" }, error: null };
      },
    },
    retryEvents,
  );
  assert.deepEqual(await retryRpc("save_operator", {}), { id: "operator-id" });
  assert.equal(rpcCalls, 2);
  assert.equal(refreshCalls, 1);
  assert.equal(retryEvents.length, 0);

  const expiredEvents = [];
  let blockedRpcCalls = 0;
  const expiredRpc = loadRpcWith(
    {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        refreshSession: async () => ({ data: { session: null }, error: null }),
      },
      rpc: async () => {
        blockedRpcCalls += 1;
        return { data: null, error: null };
      },
    },
    expiredEvents,
  );
  await assert.rejects(expiredRpc("save_operator", {}), /central_session_expired/);
  assert.equal(blockedRpcCalls, 0);
  assert.equal(expiredEvents[0]?.type, "purificadora:central-auth-required");

  console.log("central-session-rpc-guard: 15/15 PASS");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
