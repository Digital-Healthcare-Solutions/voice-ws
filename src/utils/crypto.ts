import crypto from "crypto"

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY!

export function decryptToken(encryptedToken: string): string {
  const [ivHex, encryptedHex] = encryptedToken.split(":")

  const iv = Buffer.from(ivHex, "hex")
  const encryptedText = Buffer.from(encryptedHex, "hex")

  const decipher = crypto.createDecipheriv(
    "aes-256-cbc", // AES with 256-bit key in CBC mode
    Buffer.from(ENCRYPTION_KEY, "hex"),
    iv
  )

  let decrypted = decipher.update(encryptedText, undefined, "utf8")
  decrypted += decipher.final("utf8")

  return decrypted
}
