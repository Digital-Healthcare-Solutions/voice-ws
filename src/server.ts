import express from "express"
import http from "http"
import WebSocket from "ws"
import url from "url"
import { handleSTT } from "./routes/stt/handler"
import { handleTTS } from "./routes/tts/handler"
import crypto from "crypto"
import dotenv from "dotenv"

dotenv.config()

if (!process.env.ENCRYPTION_KEY) {
  console.error("ENCRYPTION_KEY is not set in the environment variables.")
  process.exit(1)
}

const app = express()
const server = http.createServer(app)
const wss = new WebSocket.Server({ noServer: true })

const AUTH_SERVER_URL = process.env.AUTH_SERVER_URL || ""
const PING_INTERVAL = 30000 // 30 seconds
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY!

// Check key length
if (Buffer.from(ENCRYPTION_KEY, "hex").length !== 32) {
  console.error(
    "Invalid encryption key length. Key must be 32 bytes (64 hexadecimal characters)."
  )
  process.exit(1)
}

function decrypt(text: string): string {
  try {
    const [ivHex, encryptedHex] = text.split(":")
    if (!ivHex || !encryptedHex) {
      throw new Error("Invalid encrypted text format")
    }

    const iv = Buffer.from(ivHex, "hex")
    const encryptedText = Buffer.from(encryptedHex, "hex")

    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      Buffer.from(ENCRYPTION_KEY, "hex"),
      iv
    )
    let decrypted = decipher.update(encryptedText)
    decrypted = Buffer.concat([decrypted, decipher.final()])

    return decrypted.toString("utf8")
  } catch (error) {
    console.error("Decryption error:", error)
    throw error
  }
}

async function validateToken(encryptedToken: string): Promise<boolean> {
  try {
    const token = decrypt(encryptedToken)
    const response = await fetch(AUTH_SERVER_URL, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.message)
    }
    return Boolean(data)
  } catch (error) {
    console.error("Token validation error:", error)
    return false
  }
}
function heartbeat(this: WebSocket) {
  ;(this as any).isAlive = true
}

server.on("upgrade", async (request, socket, head) => {
  let pathname: string | null = null
  let token: string | null = null

  try {
    const url = new URL(request.url || "", `http://${request.headers.host}`)
    pathname = url.pathname
    token = url.searchParams.get("token")

    const isValidToken = token ? await validateToken(token) : false

    console.log("isValidToken", isValidToken)

    if (pathname === "/stt" || pathname === "/tts") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        if (!isValidToken || !token) {
          ws.close(3000, "Invalid token")
          return
        }

        ;(ws as any).isAlive = true
        ws.on("pong", heartbeat)

        const pingInterval = setInterval(() => {
          if ((ws as any).isAlive === false) {
            console.log("Connection dead. Terminating.")
            clearInterval(pingInterval)
            return ws.terminate()
          }

          ;(ws as any).isAlive = false
          ws.ping()
        }, PING_INTERVAL)

        ws.on("close", () => {
          clearInterval(pingInterval)
        })

        ws.send(
          JSON.stringify({ type: "ConnectionStatus", status: "authenticated" })
        )

        if (pathname === "/stt") {
          console.log("STT route")
          handleSTT(ws)
        } else {
          console.log("TTS route")
          handleTTS(ws)
        }
      })
    } else {
      throw new Error("Invalid pathname")
    }
  } catch (error: any) {
    if (
      error.message === "Invalid token" ||
      error.message === "No token provided"
    ) {
      console.error("Invalid token")
      socket.write(
        "HTTP/1.1 401 Web Socket Protocol Handshake\r\n" +
          "Upgrade: WebSocket\r\n" +
          "Connection: Upgrade\r\n" +
          "\r\n"
      )
    }
    console.error("Authentication error:", error)
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n")
    socket.destroy()
  }
})

app.get("/", (req, res) => {
  res.send("Status: OK")
})

const PORT = process.env.PORT || 5000
server.listen(PORT, () => {
  console.log(`⚡️ [server]: Server is running on port ${PORT}`)
})
