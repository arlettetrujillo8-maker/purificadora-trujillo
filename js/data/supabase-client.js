import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.2/+esm";
import { SUPABASE_CONFIG } from "../v3/supabase-config.js?v=20260815-icono-ruta-pickup";

export const SUPABASE_CLIENT_BUILD = "20260815-icono-ruta-pickup";
export const DEVICE_KEY = "purificadora_v3_device_id";
export const DEVICE_NAME_KEY = "purificadora_v3_device_name";
export const AUTH_STORAGE_KEY = "purificadora_v3_auth";
export const REMEMBER_DEVICE_KEY = "purificadora_v3_remember_device";
export const REMEMBERED_EMAIL_KEY = "purificadora_v3_remembered_email";

export function getRememberDevicePreference() {
  return true;
}

export function setRememberDevicePreference() {
  const session = window.sessionStorage.getItem(AUTH_STORAGE_KEY);
  window.localStorage.setItem(REMEMBER_DEVICE_KEY, "true");
  if (session && !window.localStorage.getItem(AUTH_STORAGE_KEY))
    window.localStorage.setItem(AUTH_STORAGE_KEY, session);
  window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
}

const centralAuthStorage = {
  getItem(key) {
    return window.localStorage.getItem(key);
  },
  setItem(key, value) {
    window.localStorage.setItem(key, value);
  },
  removeItem(key) {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};

function migrateLegacyAuthSession() {
  try {
    const legacySession = window.sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (legacySession && !window.localStorage.getItem(AUTH_STORAGE_KEY))
      window.localStorage.setItem(AUTH_STORAGE_KEY, legacySession);
    window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
    window.localStorage.setItem(REMEMBER_DEVICE_KEY, "true");
  } catch (error) {
    console.warn("No se pudo migrar la sesión central anterior.", error);
  }
}

export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    const uuidHelper = globalThis.PurificadoraCrypto?.safeRandomUUID;
    if (typeof uuidHelper !== "function")
      throw new Error("El generador UUID compatible no estÃ¡ cargado");
    id = uuidHelper();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function getDeviceName() {
  let name = localStorage.getItem(DEVICE_NAME_KEY);
  if (!name) {
    name = `PWA ${navigator.platform || "navegador"}`.slice(0, 120);
    localStorage.setItem(DEVICE_NAME_KEY, name);
  }
  return name;
}

migrateLegacyAuthSession();

export const supabase = createClient(
  SUPABASE_CONFIG.url,
  SUPABASE_CONFIG.publishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: centralAuthStorage,
      storageKey: AUTH_STORAGE_KEY,
    },
  },
);

export { SUPABASE_CONFIG };
