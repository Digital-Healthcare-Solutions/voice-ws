import WebSocket from "ws"
import {
  createClient,
  ListenLiveClient,
  LiveTranscriptionEvents,
} from "@deepgram/sdk"
import OpenAI from "openai"
import { ElevenLabsClient } from "elevenlabs"
import dotenv from "dotenv"
import { Readable } from "stream"

dotenv.config()

const openai = new OpenAI()
const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY as string,
})

const KEEP_ALIVE_INTERVAL = 3 * 1000

const defaultMedicalKeywords = [
  "Metoprolol:1",
  "Lisinopril:1",
  "Atorvastatin:1",
  "Levothyroxine:1",
  "Amlodipine:1",
  "Simvastatin:1",
  "Omeprazole:1",
  "Losartan:1",
  "Albuterol:1",
  "Topamax:1",
  "Lamictal:1",
  "Gabapentin:1",
]

async function processWithAI(transcript: string) {
  try {
    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are an AI medical assistant. Respond concisely and professionally to patient inquiries.",
        },
        {
          role: "user",
          content: transcript,
        },
      ],
      model: "gpt-4o-mini",
    })

    return (
      completion.choices[0]?.message?.content ||
      "I apologize, but I couldn't process that request."
    )
  } catch (error) {
    console.error("AI processing error:", error)
    return "I apologize, but I'm having trouble processing your request right now."
  }
}

function streamToArrayBuffer(readableStream: Readable): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    readableStream.on("data", (chunk) => {
      chunks.push(chunk)
    })
    readableStream.on("end", () => {
      resolve(Buffer.concat(chunks).buffer)
    })
    readableStream.on("error", reject)
  })
}

async function convertToSpeech(text: string) {
  try {
    const audioStream = await elevenlabs.textToSpeech.convertAsStream(
      process.env.ELEVEN_LABS_VOICE_ID || "default",
      {
        output_format: "ulaw_8000",
        text: text,
        model_id: "eleven_flash_v2_5",
      }
    )
    return streamToArrayBuffer(audioStream)
  } catch (error) {
    console.error("TTS conversion error:", error)
    throw error
  }
}

const setupDeepgram = (ws: WebSocket, lang: string, streamSid: string) => {
  const deepgramClient = createClient(process.env.DEEPGRAM_API_KEY as string)
  let keepAlive: NodeJS.Timeout | null = null

  const deepgram = deepgramClient.listen.live({
    smart_format: true,
    model: lang === "en-US" ? "nova-2-medical" : "nova-2",
    interim_results: false,
    diarize: true,
    language: lang,
    endpointing: 100,
    keywords: defaultMedicalKeywords,
  })

  if (keepAlive) clearInterval(keepAlive)
  keepAlive = setInterval(() => deepgram.keepAlive(), KEEP_ALIVE_INTERVAL)

  deepgram.addListener(LiveTranscriptionEvents.Open, () => {
    console.log("Voice Agent: Deepgram connected")
    // ws.send(
    //   JSON.stringify({
    //     type: "status",
    //     message: "Ready to process audio",
    //   })
    // )
  })

  deepgram.addListener(LiveTranscriptionEvents.Transcript, async (data) => {
    if (data.is_final) {
      console.log("Voice Agent: Processing final transcript")

      try {
        const transcript = data.channel.alternatives[0]?.transcript || ""
        const aiResponse = await processWithAI(transcript)
        const audioData = await convertToSpeech(aiResponse)

        // Send audio back in Twilio's expected format
        ws.send(
          JSON.stringify({
            streamSid,
            event: "media",
            media: {
              payload: Buffer.from(audioData as any).toString("base64"),
            },
          })
        )
      } catch (error) {
        console.error("Processing error:", error)
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Error processing response",
          })
        )
      }
    }
  })

  deepgram.addListener(LiveTranscriptionEvents.Error, (error) => {
    console.error("Voice Agent: Deepgram error", error)
    if (keepAlive) clearInterval(keepAlive)
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Audio processing error",
      })
    )
  })

  const finish = () => {
    if (keepAlive) {
      clearInterval(keepAlive)
      keepAlive = null
    }
    deepgram.requestClose()
    deepgram.removeAllListeners()
  }

  return { deepgram, finish }
}

export function handleVoiceAgent(ws: WebSocket, lang: string) {
  let deepgramWrapper: ListenLiveClient | null = null
  let finishFn: (() => void) | null = null
  let currentStreamSid: string | null = null

  ws.on("message", (data: string) => {
    const message = JSON.parse(data)

    if (message.toString().includes("ping")) {
      ws.send(JSON.stringify({ type: "pong" }))
      return
    }

    if (message.event === "start" && message.start) {
      console.log("Voice Agent: Call started")
      // Initialize Deepgram when the call starts
      currentStreamSid = message.start.streamSid
      if (currentStreamSid) {
        const result = setupDeepgram(ws, lang, currentStreamSid)
        deepgramWrapper = result.deepgram
        finishFn = result.finish
      } else {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Stream ID not provided",
          })
        )
      }
    } else if (message.event === "media" && message.media) {
      console.log("Voice Agent: Received media")
      // Process incoming audio
      if (deepgramWrapper?.getReadyState() === 1) {
        const audioData = Buffer.from(message.media.payload, "base64")
        deepgramWrapper.send(audioData)
      }
    } else if (message.event === "stop") {
      // Clean up when the call ends
      if (finishFn) finishFn()
      deepgramWrapper = null
      finishFn = null
      currentStreamSid = null
    }

    // if (deepgramWrapper && deepgramWrapper.getReadyState() === 1) {
    //   deepgramWrapper.send(message as Buffer)
    // } else if (deepgramWrapper && deepgramWrapper.getReadyState() >= 2) {
    //   finish()
    //   const result = setupDeepgram(ws, lang)
    //   deepgramWrapper = result.deepgram
    //   finish = result.finish
    // }
  })

  ws.on("close", () => {
    console.log("Voice Agent: Connection closed")
    if (finishFn) finishFn()
    deepgramWrapper = null
    finishFn = null
    currentStreamSid = null
  })

  ws.on("error", (error) => {
    console.error("Voice Agent: WebSocket error", error)
    if (finishFn) finishFn()
    deepgramWrapper = null
    finishFn = null
    currentStreamSid = null
  })
}
