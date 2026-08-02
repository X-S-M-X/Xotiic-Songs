(() => {
  "use strict";

  const STORAGE_KEY = "xotiic-upload-vault-v1";
  const VAULT_VERSION = 1;
  const PBKDF2_ITERATIONS = 310000;

  const cryptoApi = globalThis.crypto;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const bytesToBase64 = (bytes) => {
    if (typeof btoa === "function") {
      let binary = "";
      const chunkSize = 0x8000;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
      }
      return btoa(binary);
    }
    return Buffer.from(bytes).toString("base64");
  };

  const base64ToBytes = (value) => {
    if (typeof atob === "function") {
      const binary = atob(value);
      return Uint8Array.from(binary, (character) => character.charCodeAt(0));
    }
    return new Uint8Array(Buffer.from(value, "base64"));
  };

  const normalizeUsername = (value) => String(value || "").trim();

  const additionalData = (username, owner, repository) =>
    encoder.encode(`xotiic-upload:${owner}/${repository}:${username}`);

  const deriveKey = async (password, salt, usages) => {
    if (!cryptoApi?.subtle) throw new Error("Secure browser encryption is unavailable on this device.");
    const material = await cryptoApi.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    return cryptoApi.subtle.deriveKey(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt,
        iterations: PBKDF2_ITERATIONS,
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      usages,
    );
  };

  const createVault = async ({ username, password, token, owner, repository }) => {
    const cleanUsername = normalizeUsername(username);
    if (cleanUsername.length < 3 || cleanUsername.length > 40) {
      throw new Error("Choose a username between 3 and 40 characters.");
    }
    if (String(password || "").length < 12) {
      throw new Error("Use a password with at least 12 characters.");
    }
    if (!String(token || "").trim()) throw new Error("A GitHub token is required.");

    const salt = cryptoApi.getRandomValues(new Uint8Array(16));
    const iv = cryptoApi.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt, ["encrypt"]);
    const encrypted = await cryptoApi.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: additionalData(cleanUsername, owner, repository),
      },
      key,
      encoder.encode(String(token).trim()),
    );

    return {
      version: VAULT_VERSION,
      username: cleanUsername,
      owner,
      repository,
      algorithm: "PBKDF2-SHA256/AES-256-GCM",
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(encrypted)),
      createdAt: new Date().toISOString(),
    };
  };

  const unlockVault = async ({ vault, username, password, owner, repository }) => {
    if (!vault || vault.version !== VAULT_VERSION) throw new Error("This admin vault needs to be set up again.");
    const cleanUsername = normalizeUsername(username);
    if (cleanUsername !== vault.username) throw new Error("The username or password is incorrect.");
    if (vault.owner !== owner || vault.repository !== repository) {
      throw new Error("This vault belongs to a different repository.");
    }

    try {
      const salt = base64ToBytes(vault.salt);
      const iv = base64ToBytes(vault.iv);
      const key = await deriveKey(password, salt, ["decrypt"]);
      const decrypted = await cryptoApi.subtle.decrypt(
        {
          name: "AES-GCM",
          iv,
          additionalData: additionalData(cleanUsername, owner, repository),
        },
        key,
        base64ToBytes(vault.ciphertext),
      );
      return decoder.decode(decrypted);
    } catch (error) {
      if (error?.message?.includes("repository")) throw error;
      throw new Error("The username or password is incorrect.");
    }
  };

  const readVault = () => {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const saveVault = (vault) => {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(vault));
  };

  const clearVault = () => {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  };

  const api = {
    STORAGE_KEY,
    createVault,
    unlockVault,
    readVault,
    saveVault,
    clearVault,
    normalizeUsername,
  };

  globalThis.XotiicVault = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
