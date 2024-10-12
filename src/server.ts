import express from "express"
import http from "http"
import WebSocket from "ws"
import { handleSTT } from "./routes/stt/handler"
import { handleTTS } from "./routes/tts/handler"
import { decryptToken } from "./utils/crypto"

const app = express()
const server = http.createServer(app)
const wss = new WebSocket.Server({ noServer: true })

const AUTH_SERVER_URL = process.env.AUTH_SERVER_URL || ""

async function validateToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(AUTH_SERVER_URL, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    })
    const data = await response.json()
    // console.log("Token validation response:", data)
    if (!response.ok) {
      throw new Error("Invalid token")
    }
    return data
  } catch (error) {
    throw new Error("Error Authenticating" + error)
  }
}

server.on("upgrade", async (request, socket, head) => {
  let pathname: string | null = null
  let token: string | null = null
  let langauge: string = "en-US"
  let keywords: string[] = []
  let utteranceTime: number = 1000
  let findAndReplaceStrings: string[] = []

  try {
    const url = new URL(request.url || "", `http://${request.headers.host}`)
    pathname = url.pathname
    token = url.searchParams.get("token")
    langauge = url.searchParams.get("lang") || "en-US"
    keywords = url.searchParams.get("keywords")?.split(",") || []
    utteranceTime = parseInt(url.searchParams.get("utteranceTime") || "1000")
    findAndReplaceStrings =
      url.searchParams.get("findAndReplace")?.split(",") || []

    if (token) {
      token = decryptToken(token)
    }

    const isValidToken = token ? await validateToken(token) : false

    if (pathname === "/stt") {
      console.log("STT route")
      wss.handleUpgrade(request, socket, head, (ws) => {
        if (!isValidToken || !token) {
          ws.close(3000, "Invalid token")
          return
        }
        ws.send(
          JSON.stringify({ type: "ConnectionStatus", status: "authenticated" })
        )
        handleSTT(ws, langauge, keywords, utteranceTime, findAndReplaceStrings)
      })
    } else if (pathname === "/tts") {
      console.log("TTS route")
      wss.handleUpgrade(request, socket, head, (ws) => {
        if (!isValidToken || !token) {
          ws.close(3000, "Invalid token")
          return
        }
        ws.send(
          JSON.stringify({ type: "ConnectionStatus", status: "authenticated" })
        )
        handleTTS(ws)
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

const PORT = process.env.PORT || 5001
server.listen(PORT, () => {
  console.log(`⚡️ [server]: Server is running on port ${PORT}`)
})
