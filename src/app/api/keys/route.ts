import { authed, jsonBody } from "@/lib/server/handler";
import { keyVaultAvailable } from "@/lib/server/crypto";
import {
  deleteAllKeys,
  deleteKey,
  keySyncEnabled,
  listKeys,
  putKey,
  setKeySync,
} from "@/lib/server/repo";

/**
 * The account's provider keys.
 *
 * GET returns them decrypted — to the authenticated owner, over HTTPS, so the
 * browser can keep streaming straight to the provider. That is the whole point
 * of BYOK and it doesn't change here; what changes is that we now also hold a
 * copy, encrypted, so the student isn't re-pasting it on every device.
 */

export const GET = authed(async (user) => {
  if (!keyVaultAvailable()) {
    return { keys: [], sync: false, available: false };
  }
  const sync = await keySyncEnabled(user.id);
  return {
    keys: sync ? await listKeys(user.id) : [],
    sync,
    available: true,
  };
});

export const POST = authed(async (user, request) => {
  if (!keyVaultAvailable()) {
    throw new Error(
      "This server isn't configured to store keys (TUTOR_AI_KEY_SECRET is unset).",
    );
  }

  const body = await jsonBody(request);

  // Flipping the preference is its own operation on the same endpoint.
  if (typeof body.sync === "boolean") {
    await setKeySync(user.id, body.sync);
    return { sync: body.sync };
  }

  if (!(await keySyncEnabled(user.id))) {
    throw new Error("Key syncing is off for this account.");
  }

  const providerId = typeof body.providerId === "string" ? body.providerId : "";
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!providerId) throw new Error("Which provider?");

  if (!key) {
    await deleteKey(user.id, providerId);
    return { ok: true, removed: true };
  }

  await putKey(user.id, providerId, key);
  return { ok: true };
});

export const DELETE = authed(async (user) => {
  await deleteAllKeys(user.id);
  return { ok: true };
});
