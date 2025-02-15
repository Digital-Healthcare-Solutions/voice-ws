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
const elevenlabs = new ElevenLabsClient()
const KEEP_ALIVE_INTERVAL = 3 * 1000

let isProcessing = false

async function processWithAI(transcript: string) {
  try {
    console.log("Processing with AI:", transcript)
    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are an AI medical assistant. Respond very concisely and professionally to patient inquiries. Do not respond with very long winded answers.",
        },
        {
          role: "user",
          content: transcript,
        },
      ],
      model: "gpt-4o-mini",
      max_completion_tokens: 200,
    })

    const response =
      completion.choices[0]?.message?.content ||
      "I apologize, but I couldn't process that request."
    console.log("AI generated response:", response)
    return response
  } catch (error) {
    console.error("AI processing error:", error)
    return "I apologize, but I'm having trouble processing your request right now."
  }
}

async function convertToSpeech(text: string) {
  try {
    console.log("Converting to speech:", text)
    const audioStream = await elevenlabs.textToSpeech.convert(
      process.env.ELEVEN_LABS_VOICE_ID || "default",
      { model_id: "eleven_flash_v2_5", output_format: "ulaw_8000", text: text }
    )
    console.log("Audio stream received from ElevenLabs")
    const readableStream = Readable.from(audioStream)
    const audioArrayBuffer = await streamToArrayBuffer(readableStream)

    return audioArrayBuffer
  } catch (error) {
    console.error("TTS conversion error:", error)
    throw error
  }
}

async function streamToArrayBuffer(
  readableStream: Readable
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    readableStream.on("data", (chunk) => {
      console.log("Received audio chunk of size:", chunk.length)
      chunks.push(chunk)
    })
    readableStream.on("end", () => {
      const buffer = Buffer.concat(chunks)
      console.log("Total audio size:", buffer.length)
      resolve(buffer.buffer)
    })
    readableStream.on("error", reject)
  })
}

function handleTwilioMessage(
  message: any,
  deepgramWrapper: ListenLiveClient | null,
  currentStreamSid: string | null = null
) {
  try {
    const parsedMessage = JSON.parse(message)

    switch (parsedMessage.event) {
      case "start":
        console.log("Call started, StreamSID:", parsedMessage.start.streamSid)
        currentStreamSid = parsedMessage.start.streamSid
        isProcessing = false
        break

      case "media":
        if (deepgramWrapper?.getReadyState() === 1 && !isProcessing) {
          const payload = Buffer.from(parsedMessage.media.payload, "base64")
          deepgramWrapper.send(payload)
        }
        break

      case "stop":
        console.log("Call ended")
        currentStreamSid = null
        isProcessing = false
        break

      default:
        console.log("Unknown message type:", parsedMessage.event)
    }
  } catch (error) {
    console.error("Error processing Twilio message:", error)
  }
}

function sendAudioToTwilio(
  ws: WebSocket,
  audioData: ArrayBuffer,
  currentStreamSid: string | null = null
) {
  if (!currentStreamSid) {
    console.error("No StreamSID available")
    return
  }

  try {
    const message = {
      streamSid: currentStreamSid,
      event: "media",
      media: {
        payload: Buffer.from(audioData).toString("base64"),
      },
    }
    console.log("Sending audio response, size:", audioData.byteLength)
    ws.send(JSON.stringify(message))
  } catch (error) {
    console.error("Error sending audio to Twilio:", error)
  }
}

const setupDeepgram = (
  ws: WebSocket,
  lang: string,
  currentStreamSid: string | null = null
) => {
  const deepgramClient = createClient(process.env.DEEPGRAM_API_KEY as string)
  let keepAlive: NodeJS.Timeout | null = null

  const deepgram = deepgramClient.listen.live({
    smart_format: true,
    model: lang === "en-US" ? "nova-2-medical" : "nova-2",
    interim_results: false,
    diarize: false,
    language: lang,
    encoding: "mulaw",
    sample_rate: 8000,
    channels: 1,
    endpointing: 100,
  })

  if (keepAlive) clearInterval(keepAlive)
  keepAlive = setInterval(() => deepgram.keepAlive(), KEEP_ALIVE_INTERVAL)

  deepgram.addListener(LiveTranscriptionEvents.Open, () => {
    console.log("Voice Agent: Deepgram connected")
  })

  deepgram.addListener(LiveTranscriptionEvents.Transcript, async (data) => {
    if (data.is_final && currentStreamSid && !isProcessing) {
      const transcript = data.channel.alternatives[0]?.transcript || ""
      if (!transcript.trim()) {
        console.log("Empty transcript received, skipping")
        return
      }

      console.log("Final transcript received:", transcript)
      isProcessing = true

      try {
        const aiResponse = await processWithAI(transcript)
        const audioData = await convertToSpeech(aiResponse)
        sendAudioToTwilio(ws, audioData, currentStreamSid)
      } catch (error) {
        console.error("Processing error:", error)
      } finally {
        isProcessing = false
      }
    }
  })

  deepgram.addListener(LiveTranscriptionEvents.Error, (error) => {
    console.error("Voice Agent: Deepgram error", error)
    if (keepAlive) clearInterval(keepAlive)
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
  console.log("Voice Agent: New connection established")
  let currentStreamSid: string | null = null
  let { deepgram, finish } = setupDeepgram(ws, lang, currentStreamSid)
  let deepgramWrapper: ListenLiveClient | null = deepgram

  ws.on("message", (message: WebSocket.Data) => {
    handleTwilioMessage(message, deepgramWrapper, currentStreamSid)
  })

  ws.on("close", () => {
    console.log("Voice Agent: Connection closed")
    finish()
    ws.removeAllListeners()
    deepgramWrapper = null
    currentStreamSid = null
  })

  ws.on("error", (error) => {
    console.error("Voice Agent: WebSocket error", error)
    finish()
    deepgramWrapper = null
    currentStreamSid = null
  })
}
