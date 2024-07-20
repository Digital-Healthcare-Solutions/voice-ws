import express from "express"
import http from "http"
import WebSocket from "ws"
import url from "url"
import { handleSTT } from "./routes/stt/handler"
import { handleTTS } from "./routes/tts/handler"

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
    return data // Adjust based on your auth server's response structure
  } catch (error) {
    console.error("Token validation error:", error)
    return false
  }
}

server.on("upgrade", async (request, socket, head) => {
  let pathname: string | null = null
  let token: string | null = null
  let langauge: string = "en-US"

  try {
    const url = new URL(request.url || "", `http://${request.headers.host}`)
    pathname = url.pathname
    token = url.searchParams.get("token")
    langauge = url.searchParams.get("lang") || "en-US"

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
        handleSTT(ws, langauge)
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

const PORT = process.env.PORT || 5000
server.listen(PORT, () => {
  console.log(`⚡️ [server]: Server is running on port ${PORT}`)
})
