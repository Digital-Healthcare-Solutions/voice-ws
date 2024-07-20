import WebSocket from "ws"
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk"
import dotenv from "dotenv"

dotenv.config()

const deepgramClient = createClient(process.env.DEEPGRAM_API_KEY as string)
let keepAlive: NodeJS.Timeout | null = null

const KEEP_ALIVE_INTERVAL = 10 * 1000 // 10 seconds

const setupDeepgram = (ws: WebSocket, lang: string) => {
  console.log("Setting up Deepgram connection...")
  const deepgram = deepgramClient.listen.live({
    smart_format: true,
    model: lang === "en-US" ? "nova-2-medical" : "nova-2",
    interim_results: true,
    diarize: true,
    language: lang,
    endpointing: 100,
  })

  if (keepAlive) clearInterval(keepAlive)

  keepAlive = setInterval(() => {
    console.log("deepgram: keepalive")
    deepgram.keepAlive()
  }, KEEP_ALIVE_INTERVAL)

  // const startKeepAlive = () => {
  //   const keepAliveInterval = setInterval(() => {
  //     if (deepgram.getReadyState() === 1) {
  //       console.log("Deepgram: Sending keepalive")
  //       deepgram.keepAlive()
  //     } else {
  //       console.log("Deepgram: Connection not open, skipping keepalive")
  //       clearInterval(keepAliveInterval)
  //     }
  //   }, KEEP_ALIVE_INTERVAL)

  //   return keepAliveInterval
  // }

  let keepAliveInterval: NodeJS.Timeout | null = null

  deepgram.addListener(LiveTranscriptionEvents.Open, () => {
    console.log("Deepgram: Connected successfully")
  })

  deepgram.addListener(LiveTranscriptionEvents.Transcript, (data) => {
    console.log("Deepgram: Transcript received", data)
    ws.send(JSON.stringify(data))
  })

  deepgram.addListener(LiveTranscriptionEvents.Metadata, (data) => {
    console.log("Deepgram: Metadata received", data)
    ws.send(JSON.stringify({ metadata: data }))
  })

  deepgram.addListener(LiveTranscriptionEvents.Close, () => {
    console.log("Deepgram: Connection closed")
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval)
    }
  })

  deepgram.addListener(LiveTranscriptionEvents.Error, (error) => {
    console.error("Deepgram: Error received", error)
    ws.send(JSON.stringify({ error: "Deepgram error occurred" }))
  })

  // return {
  //   send: (data: Buffer) => {
  //     if (deepgram.getReadyState() === 1) {
  //       deepgram.send(data)
  //       return true
  //     }
  //     return false
  //   },
  //   getReadyState: () => deepgram.getReadyState(),
  //   finish: () => {
  //     if (keepAliveInterval) {
  //       clearInterval(keepAliveInterval)
  //     }
  //     deepgram.requestClose()
  //   },
  // }
  return deepgram
}

export function handleSTT(ws: WebSocket, lang: string) {
  console.log("STT: New WebSocket connection established")
  let deepgramWrapper = setupDeepgram(ws, lang)
  let messageCount = 0

  ws.on("message", (message: WebSocket.Data) => {
    messageCount++
    console.log(`STT: Received audio data (Message #${messageCount})`)
    console.log(`Deepgram Ready State: ${deepgramWrapper.getReadyState()}`)
    //looking for if message === {type:"ping"}
    if (message.toString().includes("ping")) {
      console.log("STT: Received ping message")
      const parsedMessage = JSON.parse(message.toString())
      if (parsedMessage.type === "ping") {
        console.log("STT: Received ping message")
        ws.send(JSON.stringify({ type: "pong" }))
        return
      }
    }
    if (deepgramWrapper.getReadyState() === 1 /* OPEN */) {
      console.log(`STT: Sending data to Deepgram (Message #${messageCount})`)
      console.log("ws: data sent to deepgram")
      deepgramWrapper.send(message as Buffer)
    } else if (
      deepgramWrapper.getReadyState() >= 2 /* 2 = CLOSING, 3 = CLOSED */
    ) {
      console.log("ws: data couldn't be sent to deepgram")
      console.log("ws: retrying connection to deepgram")
      /* Attempt to reopen the Deepgram connection */
      deepgramWrapper.requestClose()
      deepgramWrapper.removeAllListeners()
      deepgramWrapper = setupDeepgram(ws, lang)
    } else {
      console.log(
        `STT: Cannot send to Deepgram. Current state: ${deepgramWrapper.getReadyState()} (Message #${messageCount})`
      )
    }
  })

  ws.on("close", () => {
    console.log("STT: WebSocket connection closed")
    deepgramWrapper.requestClose()
    deepgramWrapper.removeAllListeners()
    //@ts-ignore
    deepgramWrapper = null
  })

  ws.on("error", (error) => {
    console.error("STT: WebSocket error", error)
  })
}
