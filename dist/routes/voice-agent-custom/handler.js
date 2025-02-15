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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleVoiceAgent = handleVoiceAgent;
const sdk_1 = require("@deepgram/sdk");
const openai_1 = __importDefault(require("openai"));
const elevenlabs_1 = require("elevenlabs");
const dotenv_1 = __importDefault(require("dotenv"));
const stream_1 = require("stream");
dotenv_1.default.config();
const openai = new openai_1.default();
const elevenlabs = new elevenlabs_1.ElevenLabsClient();
const KEEP_ALIVE_INTERVAL = 3 * 1000;
let isProcessing = false;
function processWithAI(transcript) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            console.log("Processing with AI:", transcript);
            const completion = yield openai.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: "You are an AI medical assistant. Respond very concisely and professionally to patient inquiries. Do not respond with very long winded answers.",
                    },
                    {
                        role: "user",
                        content: transcript,
                    },
                ],
                model: "gpt-4o-mini",
                max_completion_tokens: 200,
            });
            const response = ((_b = (_a = completion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) ||
                "I apologize, but I couldn't process that request.";
            console.log("AI generated response:", response);
            return response;
        }
        catch (error) {
            console.error("AI processing error:", error);
            return "I apologize, but I'm having trouble processing your request right now.";
        }
    });
}
function convertToSpeech(text) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log("Converting to speech:", text);
            const audioStream = yield elevenlabs.textToSpeech.convert(process.env.ELEVEN_LABS_VOICE_ID || "default", { model_id: "eleven_flash_v2_5", output_format: "ulaw_8000", text: text });
            console.log("Audio stream received from ElevenLabs");
            const readableStream = stream_1.Readable.from(audioStream);
            const audioArrayBuffer = yield streamToArrayBuffer(readableStream);
            return audioArrayBuffer;
        }
        catch (error) {
            console.error("TTS conversion error:", error);
            throw error;
        }
    });
}
function streamToArrayBuffer(readableStream) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            const chunks = [];
            readableStream.on("data", (chunk) => {
                console.log("Received audio chunk of size:", chunk.length);
                chunks.push(chunk);
            });
            readableStream.on("end", () => {
                const buffer = Buffer.concat(chunks);
                console.log("Total audio size:", buffer.length);
                resolve(buffer.buffer);
            });
            readableStream.on("error", reject);
        });
    });
}
function handleTwilioMessage(message, deepgramWrapper, currentStreamSid = null) {
    try {
        const parsedMessage = JSON.parse(message);
        switch (parsedMessage.event) {
            case "start":
                console.log("Call started, StreamSID:", parsedMessage.start.streamSid);
                currentStreamSid = parsedMessage.start.streamSid;
                isProcessing = false;
                break;
            case "media":
                if ((deepgramWrapper === null || deepgramWrapper === void 0 ? void 0 : deepgramWrapper.getReadyState()) === 1 && !isProcessing) {
                    const payload = Buffer.from(parsedMessage.media.payload, "base64");
                    deepgramWrapper.send(payload);
                }
                break;
            case "stop":
                console.log("Call ended");
                currentStreamSid = null;
                isProcessing = false;
                break;
            default:
                console.log("Unknown message type:", parsedMessage.event);
        }
    }
    catch (error) {
        console.error("Error processing Twilio message:", error);
    }
}
function sendAudioToTwilio(ws, audioData, currentStreamSid = null) {
    if (!currentStreamSid) {
        console.error("No StreamSID available");
        return;
    }
    try {
        const message = {
            streamSid: currentStreamSid,
            event: "media",
            media: {
                payload: Buffer.from(audioData).toString("base64"),
            },
        };
        console.log("Sending audio response, size:", audioData.byteLength);
        ws.send(JSON.stringify(message));
    }
    catch (error) {
        console.error("Error sending audio to Twilio:", error);
    }
}
const setupDeepgram = (ws, lang, currentStreamSid = null) => {
    const deepgramClient = (0, sdk_1.createClient)(process.env.DEEPGRAM_API_KEY);
    let keepAlive = null;
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
    });
    if (keepAlive)
        clearInterval(keepAlive);
    keepAlive = setInterval(() => deepgram.keepAlive(), KEEP_ALIVE_INTERVAL);
    deepgram.addListener(sdk_1.LiveTranscriptionEvents.Open, () => {
        console.log("Voice Agent: Deepgram connected");
    });
    deepgram.addListener(sdk_1.LiveTranscriptionEvents.Transcript, (data) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        if (data.is_final && currentStreamSid && !isProcessing) {
            const transcript = ((_a = data.channel.alternatives[0]) === null || _a === void 0 ? void 0 : _a.transcript) || "";
            if (!transcript.trim()) {
                console.log("Empty transcript received, skipping");
                return;
            }
            console.log("Final transcript received:", transcript);
            isProcessing = true;
            try {
                const aiResponse = yield processWithAI(transcript);
                const audioData = yield convertToSpeech(aiResponse);
                sendAudioToTwilio(ws, audioData, currentStreamSid);
            }
            catch (error) {
                console.error("Processing error:", error);
            }
            finally {
                isProcessing = false;
            }
        }
    }));
    deepgram.addListener(sdk_1.LiveTranscriptionEvents.Error, (error) => {
        console.error("Voice Agent: Deepgram error", error);
        if (keepAlive)
            clearInterval(keepAlive);
    });
    const finish = () => {
        if (keepAlive) {
            clearInterval(keepAlive);
            keepAlive = null;
        }
        deepgram.requestClose();
        deepgram.removeAllListeners();
    };
    return { deepgram, finish };
};
function handleVoiceAgent(ws, lang) {
    console.log("Voice Agent: New connection established");
    let currentStreamSid = null;
    let { deepgram, finish } = setupDeepgram(ws, lang, currentStreamSid);
    let deepgramWrapper = deepgram;
    ws.on("message", (message) => {
        handleTwilioMessage(message, deepgramWrapper, currentStreamSid);
    });
    ws.on("close", () => {
        console.log("Voice Agent: Connection closed");
        finish();
        ws.removeAllListeners();
        deepgramWrapper = null;
        currentStreamSid = null;
    });
    ws.on("error", (error) => {
        console.error("Voice Agent: WebSocket error", error);
        finish();
        deepgramWrapper = null;
        currentStreamSid = null;
    });
}
