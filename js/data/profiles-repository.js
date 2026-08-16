import {
  supabase,
  getDeviceId,
  getDeviceName,
} from "./supabase-client.js?v=20260815-envases-pendientes";
import { selectAll, rpc } from "./repository-utils.js?v=20260815-envases-pendientes";

const PUBLIC_PROFILE_FIELDS =
  "id,name,username,role,center,route,permissions,active,pin_configured,created_at,updated_at";
const LEGACY_PROFILE_FIELDS =
  "id,name,username,role,center,route,permissions,active,created_at,updated_at";

function withoutPinStatus(row) {
  return row ? { ...row, pin_configured: false } : row;
}

export const profilesRepository = {
  current: async () => {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!user) return null;
    let { data, error } = await supabase
      .from("profiles")
      .select(PUBLIC_PROFILE_FIELDS)
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (error?.message?.includes("pin_configured")) {
      ({ data, error } = await supabase
        .from("profiles")
        .select(LEGACY_PROFILE_FIELDS)
        .eq("auth_user_id", user.id)
        .maybeSingle());
      data = withoutPinStatus(data);
    }
    if (error) throw error;
    return data;
  },
  list: async () => {
    try {
      return await selectAll("profiles", PUBLIC_PROFILE_FIELDS, (query) =>
        query.order("name"),
      );
    } catch (error) {
      if (!error?.message?.includes("pin_configured")) throw error;
      const rows = await selectAll("profiles", LEGACY_PROFILE_FIELDS, (query) =>
        query.order("name"),
      );
      return rows.map(withoutPinStatus);
    }
  },
  registerDevice: () =>
    rpc("register_device", {
      p_device_id: getDeviceId(),
      p_name: getDeviceName(),
    }),
  validatePin: (profileId, pin) =>
    rpc("validate_operator_pin", {
      p_profile_id: profileId,
      p_pin: pin,
    }),
  save: (operator) =>
    rpc("save_operator", {
      p_profile_id: operator.id || null,
      p_device_id: getDeviceId(),
      p_name: operator.name,
      p_username: operator.username,
      p_role: operator.role,
      p_center: operator.center,
      p_permissions: operator.permissions || [],
      p_pin: operator.pin || null,
    }),
  setActive: (profileId, active) =>
    rpc("set_operator_active", {
      p_profile_id: profileId,
      p_active: Boolean(active),
      p_device_id: getDeviceId(),
    }),
  remove: (profileId) =>
    rpc("delete_operator", {
      p_profile_id: profileId,
      p_device_id: getDeviceId(),
    }),
};
