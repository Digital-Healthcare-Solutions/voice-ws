"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleDeepgramVoiceAgent = handleDeepgramVoiceAgent;
const sdk_1 = require("@deepgram/sdk");
const deepgram = (0, sdk_1.createClient)(process.env.DEEPGRAM_API_KEY);
function handleDeepgramVoiceAgent(ws, lang) {
    console.log("Setting up Deepgram Voice Agent");
    const connection = deepgram.agent();
    let keepAliveInterval;
    let currentStreamSid = null;
    // Handle incoming Twilio messages
    function handleTwilioMessage(message) {
        try {
            const data = JSON.parse(message);
            //   console.log("Received Twilio event:", data.event)
            switch (data.event) {
                case "start":
                    currentStreamSid = data.start.streamSid;
                    console.log("Call started, StreamSID:", currentStreamSid);
                    break;
                case "media":
                    if (data.media && data.media.payload) {
                        // Decode base64 audio from Twilio and send to Deepgram
                        const audioData = Buffer.from(data.media.payload, "base64");
                        connection.send(audioData);
                    }
                    break;
                case "stop":
                    console.log("Call ended");
                    currentStreamSid = null;
                    break;
            }
        }
        catch (error) {
            console.error("Error processing Twilio message:", error);
        }
    }
    // Set up Deepgram connection handlers
    connection.on(sdk_1.AgentEvents.Open, () => __awaiter(this, void 0, void 0, function* () {
        console.log("Deepgram connection opened");
        yield connection.configure({
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
                    instructions: "Your name is Ava. You are a helpful AI assistant assisting patients over the phone. DO NOT reply with markdown of any kind such as *, only with plain text.",
                },
            },
            context: {
                messages: [
                    {
                        //@ts-ignore
                        role: "assistant",
                        // type: "assistant",
                        content: "Hello! My name is Ava. I'm an AI voice assistant for Axon AI. I can answer any questions you may have about any products and I can even book a demo for you if you would like. How can I assist you today?",
                    },
                ],
                replay: true,
            },
        });
        console.log("Deepgram Agent configured");
        // Set up keepalive
        // keepAliveInterval = setInterval(() => {
        //   console.log("Sending keepalive")
        //   void connection.keepAlive()
        // }, 5000)
    }));
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
    connection.on(sdk_1.AgentEvents.Audio, (audio) => {
        if (!currentStreamSid) {
            console.log("No StreamSID available, cannot send audio");
            return;
        }
        // Send audio back to Twilio in the expected format
        const message = {
            event: "media",
            streamSid: currentStreamSid,
            media: {
                payload: Buffer.from(audio).toString("base64"),
            },
        };
        ws.send(JSON.stringify(message));
    });
    // Handle various Deepgram events
    connection.on(sdk_1.AgentEvents.Error, (error) => {
        console.error("Deepgram error:", error);
    });
    connection.on(sdk_1.AgentEvents.AgentAudioDone, (message) => {
        console.error("Deepgram agent audio done:", message);
    });
    connection.on(sdk_1.AgentEvents.AgentStartedSpeaking, (message) => {
        console.error("Deepgram agent started speaking:", message);
    });
    connection.on(sdk_1.AgentEvents.AgentThinking, (message) => {
        console.error("Deepgram agent thinking:", message);
    });
    connection.on(sdk_1.AgentEvents.Close, () => {
        console.log("Deepgram connection closed");
        // clearInterval(keepAliveInterval)
        currentStreamSid = null;
        connection.removeAllListeners();
    });
    // Log agent messages for debugging
    connection.on(sdk_1.AgentEvents.ConversationText, (message) => {
        console.log("User message:", message);
    });
    connection.on(sdk_1.AgentEvents.AgentStartedSpeaking, (message) => {
        console.log("Agent message:", message);
    });
    connection.on(sdk_1.AgentEvents.SettingsApplied, (message) => {
        console.log("Settings applied:", message);
    });
    // Handle WebSocket events
    ws.on("message", (message) => {
        handleTwilioMessage(message.toString());
    });
    ws.on("close", () => {
        console.log("Twilio connection closed");
        connection.removeAllListeners();
        connection.disconnect();
        // clearInterval(keepAliveInterval)
        currentStreamSid = null;
    });
    ws.on("error", (error) => {
        console.error("WebSocket error:", error);
        connection.removeAllListeners();
        connection.disconnect();
        // clearInterval(keepAliveInterval)
        currentStreamSid = null;
    });
}
