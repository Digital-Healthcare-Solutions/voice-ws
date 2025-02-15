// routes/voice-agent/handler.ts
import WebSocket from "ws"
import { createClient, AgentEvents } from "@deepgram/sdk"
import fs from "fs"

const deepgram = createClient(process.env.DEEPGRAM_API_KEY)

export function handleDeepgramVoiceAgent(ws: WebSocket, lang: string) {
  console.log("Setting up Deepgram Voice Agent")
  const connection = deepgram.agent()
  let keepAliveInterval: NodeJS.Timeout
  let currentStreamSid: string | null = null

  // Handle incoming Twilio messages
  function handleTwilioMessage(message: string) {
    try {
      const data = JSON.parse(message)
      //   console.log("Received Twilio event:", data.event)

      switch (data.event) {
        case "start":
          currentStreamSid = data.start.streamSid
          console.log("Call started, StreamSID:", currentStreamSid)
          break

        case "media":
          if (data.media && data.media.payload) {
            // Decode base64 audio from Twilio and send to Deepgram
            const audioData = Buffer.from(data.media.payload, "base64")
            connection.send(audioData)
          }
          break

        case "stop":
          console.log("Call ended")
          currentStreamSid = null
          break
      }
    } catch (error) {
      console.error("Error processing Twilio message:", error)
    }
  }

  // Set up Deepgram connection handlers
  connection.on(AgentEvents.Open, async () => {
    console.log("Deepgram connection opened")
    await connection.configure({
      audio: {
        input: {
          encoding: "mulaw",
          sampleRate: 8000,
        },
        output: {
          encoding: "mulaw",
          sampleRate: 8000,
          container: "none",
        },
      },
      agent: {
        listen: {
          model: "nova-3",
        },
        speak: {
          // @ts-ignore
          provider: "eleven_labs",
          voice_id: process.env.ELEVEN_LABS_VOICE_ID,
        },
        think: {
          provider: {
            type: "open_ai",
          },
          model: "gpt-4o-mini",
          instructions:
            "Your name is Ava. You are a helpful AI assistant assisting patients over the phone. DO NOT reply with markdown of any kind such as *, only with plain text.",
        },
      },
      context: {
        messages: [
          {
            //@ts-ignore
            role: "assistant",
            // type: "assistant",
            content:
              "Hello! My name is Ava. I'm an AI voice assistant for Axon AI. I can answer any questions you may have about any products and I can even book a demo for you if you would like. How can I assist you today?",
          },
        ],
        replay: true,
      },
    })
    console.log("Deepgram Agent configured")

    // Set up keepalive
    // keepAliveInterval = setInterval(() => {
    //   console.log("Sending keepalive")
    //   void connection.keepAlive()
    // }, 5000)
  })

  //   connection.on(AgentEvents.Welcome, (message) => {
  //     console.log("Deepgram welcome message:", message)
  //     const audioFile = fs.readFileSync("./public/ava-intro.ulaw")
  //     const audioData = Buffer.from(audioFile).toString("base64")
  //     const avaMessage = {
  //       event: "media",
  //       streamSid: currentStreamSid,
  //       media: {
  //         payload: audioData,
  //       },
  //     }
  //     ws.send(JSON.stringify(avaMessage))
  //   })

  // Handle incoming audio from Deepgram
  connection.on(AgentEvents.Audio, (audio) => {
    if (!currentStreamSid) {
      console.log("No StreamSID available, cannot send audio")
      return
    }

    // Send audio back to Twilio in the expected format
    const message = {
      event: "media",
      streamSid: currentStreamSid,
      media: {
        payload: Buffer.from(audio).toString("base64"),
      },
    }
    ws.send(JSON.stringify(message))
  })

  // Handle various Deepgram events
  connection.on(AgentEvents.Error, (error) => {
    console.error("Deepgram error:", error)
  })
  connection.on(AgentEvents.AgentAudioDone, (message) => {
    console.error("Deepgram agent audio done:", message)
  })
  connection.on(AgentEvents.AgentStartedSpeaking, (message) => {
    console.error("Deepgram agent started speaking:", message)
  })

  connection.on(AgentEvents.AgentThinking, (message) => {
    console.error("Deepgram agent thinking:", message)
  })

  connection.on(AgentEvents.Close, () => {
    console.log("Deepgram connection closed")
    // clearInterval(keepAliveInterval)
    currentStreamSid = null
    connection.removeAllListeners()
  })

  // Log agent messages for debugging
  connection.on(AgentEvents.ConversationText, (message) => {
    console.log("User message:", message)
  })

  connection.on(AgentEvents.AgentStartedSpeaking, (message) => {
    console.log("Agent message:", message)
  })

  connection.on(AgentEvents.SettingsApplied, (message) => {
    console.log("Settings applied:", message)
  })

  // Handle WebSocket events
  ws.on("message", (message: WebSocket.Data) => {
    handleTwilioMessage(message.toString())
  })

  ws.on("close", () => {
    console.log("Twilio connection closed")
    connection.removeAllListeners()
    connection.disconnect()
    // clearInterval(keepAliveInterval)
    currentStreamSid = null
  })

  ws.on("error", (error) => {
    console.error("WebSocket error:", error)
    connection.removeAllListeners()
    connection.disconnect()
    // clearInterval(keepAliveInterval)
    currentStreamSid = null
  })
}
