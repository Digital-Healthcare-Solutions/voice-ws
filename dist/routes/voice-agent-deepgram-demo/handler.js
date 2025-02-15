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
    let silenceWarningTimeout;
    let silenceDisconnectTimeout;
    function resetSilenceTimers() {
        // Clear existing timeouts
        if (silenceWarningTimeout)
            clearTimeout(silenceWarningTimeout);
        if (silenceDisconnectTimeout)
            clearTimeout(silenceDisconnectTimeout);
        // Set new timeouts
        silenceWarningTimeout = setTimeout(() => {
            console.log("No audio detected for 10 seconds, sending warning");
            connection.injectAgentMessage("Are you still there?");
            // Set disconnect timeout after warning
            silenceDisconnectTimeout = setTimeout(() => {
                console.log("No response after warning, ending call");
                connection.injectAgentMessage("Since I haven't heard from you, I'll end the call now. Feel free to call back when you're ready. Goodbye!");
                setTimeout(() => {
                    ws.close();
                }, 7000); // Give time for the goodbye message to be spoken
            }, 5000); // 5 seconds after warning
        }, 15000); // 15 seconds of silence
    }
    function clearTimers() {
        if (silenceWarningTimeout)
            clearTimeout(silenceWarningTimeout);
        if (silenceDisconnectTimeout)
            clearTimeout(silenceDisconnectTimeout);
    }
    // Handle incoming Twilio messages
    function handleTwilioMessage(message) {
        try {
            const data = JSON.parse(message);
            //   console.log("Received Twilio event:", data.event)
            switch (data.event) {
                case "start":
                    resetSilenceTimers();
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
                    connection.disconnect();
                    connection.removeAllListeners();
                    clearTimers();
                    ws.close();
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
                    // provider: "cartesia",
                    // voice_id: "f9836c6e-a0bd-460e-9d3c-f7299fa60f94",
                },
                // @ts-ignore (they do support groq but the current SDK doesn't lol)
                think: {
                    provider: {
                        // type: "groq",
                        type: "open_ai",
                    },
                    // model: "llama3-70b-8192",
                    model: "gpt-4o-mini",
                    instructions: "Your name is Ava. You are a helpful AI assistant assisting patients over the phone. ",
                    functions: [
                        {
                            name: "hang_up",
                            description: "hang up the phone call when you are done.",
                            parameters: {
                                type: "object",
                                properties: {
                                    shouldHangUp: {
                                        type: "boolean", // the type of the input
                                        description: "true if the call should be hung up",
                                    },
                                },
                                // @ts-ignore
                                required: ["shouldHangUp"],
                            },
                        },
                        {
                            name: "voicemail_detected",
                            description: "Leave a voicemail message that will be played to the user and then hang up.",
                            parameters: {
                                type: "object",
                                properties: {
                                    message: {
                                        type: "string", // the type of the input
                                        description: "The voicemail message to play to the user",
                                    },
                                    timeout: {
                                        type: "number",
                                        description: "The amount of time to wait before hanging up (the timeout in seconds). Should be long enough for you to deliver the full message.",
                                    },
                                },
                                // @ts-ignore
                                required: ["message", "timeout"],
                            },
                        },
                    ],
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
    connection.on(sdk_1.AgentEvents.UserStartedSpeaking, (message) => {
        console.error("Deepgram user started speaking:", message);
        //interupt the agent. make it stop speaking
        resetSilenceTimers();
        ws.send(JSON.stringify({
            event: "clear",
            streamSid: currentStreamSid,
        }));
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
    // Log agent messages for debugging
    connection.on(sdk_1.AgentEvents.ConversationText, (message) => {
        console.log("User message:", message);
    });
    connection.on(sdk_1.AgentEvents.FunctionCallRequest, (message) => {
        console.log("Function Call Request:", message);
        console.log("Calling function:", message.function_name);
        if (message.function_name === "hang_up") {
            connection.injectAgentMessage("If you have any further questions, please don't hesitate to call us back. Goodbye!");
            setTimeout(() => {
                ws.close();
            }, 5500);
        }
        if (message.function_name === "voicemail_detected") {
            connection.injectAgentMessage(message.input.message);
            setTimeout(() => {
                ws.close();
            }, message.input.timeout * 1000 || 10000);
        }
    });
    connection.on(sdk_1.AgentEvents.FunctionCalling, (message) => {
        console.log("Function Calling:", message);
    });
    connection.on(sdk_1.AgentEvents.SettingsApplied, (message) => {
        console.log("Settings applied:", message);
    });
    connection.on(sdk_1.AgentEvents.Close, () => {
        console.log("Deepgram connection closed");
        // clearInterval(keepAliveInterval)
        currentStreamSid = null;
        connection.removeAllListeners();
        ws.close();
        clearTimers();
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
        clearTimers();
    });
    ws.on("error", (error) => {
        console.error("WebSocket error:", error);
        connection.removeAllListeners();
        connection.disconnect();
        // clearInterval(keepAliveInterval)
        currentStreamSid = null;
        clearTimers();
    });
}
