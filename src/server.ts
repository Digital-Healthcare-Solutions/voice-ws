// server.ts
import express, { Response, Request } from "express"
import http from "http"
import WebSocket from "ws"
import { handleSTT } from "./routes/stt/handler"
import { handleTTS } from "./routes/tts/handler"
import { decryptToken } from "./utils/crypto"
import { handleVoiceAgent } from "./routes/voice-agent-custom/handler"
import VoiceResponse from "twilio/lib/twiml/VoiceResponse"
import { handleDeepgramVoiceAgent } from "./routes/voice-agent-deepgram-demo/handler"
import twilio from "twilio"

const app = express()
const server = http.createServer(app)
const wss = new WebSocket.Server({ noServer: true })

// Express middleware
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// HTTP Routes
app.get("/", (req, res) => {
  res.send("Server is running")
})

// Express route for incoming Twilio calls
app.post(
  "/call/voice-agent-deepgram-demo",
  // twilio.webhook(),
  (req: Request, res: Response) => {
    const twiml = new VoiceResponse()
    const connect = twiml.connect()

    //get api_key from request
    const apiKey = req.headers.authorization?.split(" ")[1]

    const stream = connect.stream({
      url:
        process.env.NODE_ENV === "production"
          ? `wss://${process.env.SERVER_DOMAIN}/voice-agent-deepgram-demo`
          : `wss://${process.env.SERVER_DOMAIN_DEV}/voice-agent-deepgram-demo`,
    })

    stream.parameter({
      name: "apiKey",
      value: apiKey,
    })

    res.writeHead(200, { "Content-Type": "text/xml" })
    res.end(twiml.toString())
  }
)

async function validateAuth(value: string): Promise<boolean> {
  try {
    const response = await fetch(process.env.AUTH_SERVER_URL || "", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${value}`,
      },
    })
    const data = await response.json()
    return response.ok && data
  } catch (error) {
    console.error("Auth error:", error)
    return false
  }
}

// Function to check if request is from Twilio
function isTwilioRequest(request: http.IncomingMessage): boolean {
  // Check if X-Twilio-Signature header exists
  return !!request.headers["x-twilio-signature"]
}

server.on("upgrade", async (request, socket, head) => {
  try {
    const url = new URL(request.url || "", `http://${request.headers.host}`)
    const pathname = url.pathname

    // Special handling for voice-agent when it's a Twilio request
    if (pathname === "/voice-agent-deepgram-demo" && isTwilioRequest(request)) {
      console.log("Handling Twilio voice agent connection")
      wss.handleUpgrade(request, socket, head, (ws) => {
        console.log("Twilio WebSocket connection established")
        // handleVoiceAgent(ws, "en-US")
        handleDeepgramVoiceAgent(ws, "en-US")
      })
      return
    }

    const apiKey = url.searchParams.get("apiKey")
    const token = url.searchParams.get("token")
    const language = url.searchParams.get("lang") || "en-US"
    const keywords = url.searchParams.get("keywords")?.split(",") || []
    const utteranceTime = parseInt(
      url.searchParams.get("utteranceTime") || "1000"
    )
    const findAndReplaceStrings =
      url.searchParams.get("findAndReplace")?.split(",") || []

    let isAuthenticated = false

    if (token) {
      const decryptedToken = decryptToken(token)
      isAuthenticated = await validateAuth(decryptedToken)
    }

    if (!isAuthenticated) {
      throw new Error("Unauthorized")
    }

    if (pathname === "/stt") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.send(
          JSON.stringify({ type: "ConnectionStatus", status: "authenticated" })
        )
        handleSTT(ws, language, keywords, utteranceTime, findAndReplaceStrings)
      })
    } else if (pathname === "/tts") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.send(
          JSON.stringify({ type: "ConnectionStatus", status: "authenticated" })
        )
        handleTTS(ws)
      })
    } else if (pathname === "/voice-agent") {
      console.log("Voice agent connection")
      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.send(
          JSON.stringify({ type: "ConnectionStatus", status: "authenticated" })
        )
        handleVoiceAgent(ws, language)
      })
    } else {
      throw new Error("Invalid pathname")
    }
  } catch (error: any) {
    console.error("Connection error:", error)
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n")
    socket.destroy()
  }
})

// Error handling middleware
app.use((err: any, req: any, res: any, next: any) => {
  console.error(err.stack)
  res.status(500).send("Something broke!")
})

const PORT = process.env.PORT || 5001

// Start the server
server.listen(PORT, () => {
  console.log(`⚡️ [server]: Server is running on port ${PORT}`)
  console.log(`HTTP: http://localhost:${PORT}`)
  console.log(`WebSocket: ws://localhost:${PORT}`)
})
