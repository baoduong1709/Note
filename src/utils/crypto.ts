const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuf(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes.buffer;
}

// Derive a cryptographic key from passphrase and salt using PBKDF2
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const rawKey = await crypto.subtle.importKey(
    "raw",
    ENCODER.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    rawKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts plaintext using AES-GCM 256-bit with a passphrase.
 * Returns string formatted as "E2EE:v1:saltHex:ivHex:ciphertextHex".
 * If plaintext is empty or passphrase is not provided, returns it as-is.
 */
export async function encryptText(plaintext: string, passphrase: string): Promise<string> {
  if (!plaintext) return "";
  if (!passphrase) return plaintext;

  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt);

    const ciphertextBuffer = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      key,
      ENCODER.encode(plaintext)
    );

    const saltHex = bufToHex(salt.buffer);
    const ivHex = bufToHex(iv.buffer);
    const ciphertextHex = bufToHex(ciphertextBuffer);

    return `E2EE:v1:${saltHex}:${ivHex}:${ciphertextHex}`;
  } catch (error) {
    console.error("Encryption failed:", error);
    throw new Error("Failed to encrypt text");
  }
}

/**
 * Decrypts E2EE formatted ciphertext using the passphrase.
 * If text is not E2EE formatted, returns original text (plaintext).
 */
export async function decryptText(encryptedText: string, passphrase: string): Promise<string> {
  if (!encryptedText) return "";
  if (!encryptedText.startsWith("E2EE:v1:")) {
    return encryptedText; // Not encrypted, return as-is
  }

  if (!passphrase) {
    return encryptedText; // Cannot decrypt without passphrase, return ciphertext
  }

  try {
    const parts = encryptedText.split(":");
    if (parts.length !== 5) {
      throw new Error("Invalid E2EE format");
    }

    const [, , saltHex, ivHex, ciphertextHex] = parts;
    const salt = new Uint8Array(hexToBuf(saltHex));
    const iv = new Uint8Array(hexToBuf(ivHex));
    const ciphertext = hexToBuf(ciphertextHex);

    const key = await deriveKey(passphrase, salt);

    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      key,
      ciphertext
    );

    return DECODER.decode(decryptedBuffer);
  } catch (error) {
    console.error("Decryption failed:", error);
    throw new Error("Failed to decrypt text. Passphrase may be incorrect.");
  }
}

/**
 * Checks if the text has E2EE signature.
 */
export function isEncrypted(text: any): boolean {
  return typeof text === "string" && text.startsWith("E2EE:v1:");
}
