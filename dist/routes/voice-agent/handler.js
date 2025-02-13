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
dotenv_1.default.config();
const openai = new openai_1.default();
const elevenlabs = new elevenlabs_1.ElevenLabsClient({
    apiKey: process.env.ELEVENLABS_API_KEY,
});
const KEEP_ALIVE_INTERVAL = 3 * 1000;
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
];
function processWithAI(transcript) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const completion = yield openai.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: "You are an AI medical assistant. Respond concisely and professionally to patient inquiries.",
                    },
                    {
                        role: "user",
                        content: transcript,
                    },
                ],
                model: "gpt-4o-mini",
            });
            return (((_b = (_a = completion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) ||
                "I apologize, but I couldn't process that request.");
        }
        catch (error) {
            console.error("AI processing error:", error);
            return "I apologize, but I'm having trouble processing your request right now.";
        }
    });
}
function streamToArrayBuffer(readableStream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        readableStream.on("data", (chunk) => {
            chunks.push(chunk);
        });
        readableStream.on("end", () => {
            resolve(Buffer.concat(chunks).buffer);
        });
        readableStream.on("error", reject);
    });
}
function convertToSpeech(text) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const audioStream = yield elevenlabs.textToSpeech.convertAsStream(process.env.ELEVEN_LABS_VOICE_ID || "default", {
                output_format: "ulaw_8000",
                text: text,
                model_id: "eleven_flash_v2_5",
            });
            return streamToArrayBuffer(audioStream);
        }
        catch (error) {
            console.error("TTS conversion error:", error);
            throw error;
        }
    });
}
const setupDeepgram = (ws, lang, streamSid) => {
    const deepgramClient = (0, sdk_1.createClient)(process.env.DEEPGRAM_API_KEY);
    let keepAlive = null;
    const deepgram = deepgramClient.listen.live({
        smart_format: true,
        model: lang === "en-US" ? "nova-2-medical" : "nova-2",
        interim_results: false,
        diarize: true,
        language: lang,
        endpointing: 100,
        keywords: defaultMedicalKeywords,
    });
    if (keepAlive)
        clearInterval(keepAlive);
    keepAlive = setInterval(() => deepgram.keepAlive(), KEEP_ALIVE_INTERVAL);
    deepgram.addListener(sdk_1.LiveTranscriptionEvents.Open, () => {
        console.log("Voice Agent: Deepgram connected");
        // ws.send(
        //   JSON.stringify({
        //     type: "status",
        //     message: "Ready to process audio",
        //   })
        // )
    });
    deepgram.addListener(sdk_1.LiveTranscriptionEvents.Transcript, (data) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        if (data.is_final) {
            console.log("Voice Agent: Processing final transcript");
            try {
                const transcript = ((_a = data.channel.alternatives[0]) === null || _a === void 0 ? void 0 : _a.transcript) || "";
                const aiResponse = yield processWithAI(transcript);
                const audioData = yield convertToSpeech(aiResponse);
                // Send audio back in Twilio's expected format
                ws.send(JSON.stringify({
                    streamSid,
                    event: "media",
                    media: {
                        payload: Buffer.from(audioData).toString("base64"),
                    },
                }));
            }
            catch (error) {
                console.error("Processing error:", error);
                ws.send(JSON.stringify({
                    type: "error",
                    message: "Error processing response",
                }));
            }
        }
    }));
    deepgram.addListener(sdk_1.LiveTranscriptionEvents.Error, (error) => {
        console.error("Voice Agent: Deepgram error", error);
        if (keepAlive)
            clearInterval(keepAlive);
        ws.send(JSON.stringify({
            type: "error",
            message: "Audio processing error",
        }));
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
    let deepgramWrapper = null;
    let finishFn = null;
    let currentStreamSid = null;
    ws.on("message", (data) => {
        const message = JSON.parse(data);
        if (message.toString().includes("ping")) {
            ws.send(JSON.stringify({ type: "pong" }));
            return;
        }
        if (message.event === "start" && message.start) {
            console.log("Voice Agent: Call started");
            // Initialize Deepgram when the call starts
            currentStreamSid = message.start.streamSid;
            if (currentStreamSid) {
                const result = setupDeepgram(ws, lang, currentStreamSid);
                deepgramWrapper = result.deepgram;
                finishFn = result.finish;
            }
            else {
                ws.send(JSON.stringify({
                    type: "error",
                    message: "Stream ID not provided",
                }));
            }
        }
        else if (message.event === "media" && message.media) {
            console.log("Voice Agent: Received media");
            // Process incoming audio
            if ((deepgramWrapper === null || deepgramWrapper === void 0 ? void 0 : deepgramWrapper.getReadyState()) === 1) {
                const audioData = Buffer.from(message.media.payload, "base64");
                deepgramWrapper.send(audioData);
            }
        }
        else if (message.event === "stop") {
            // Clean up when the call ends
            if (finishFn)
                finishFn();
            deepgramWrapper = null;
            finishFn = null;
            currentStreamSid = null;
        }
        // if (deepgramWrapper && deepgramWrapper.getReadyState() === 1) {
        //   deepgramWrapper.send(message as Buffer)
        // } else if (deepgramWrapper && deepgramWrapper.getReadyState() >= 2) {
        //   finish()
        //   const result = setupDeepgram(ws, lang)
        //   deepgramWrapper = result.deepgram
        //   finish = result.finish
        // }
    });
    ws.on("close", () => {
        console.log("Voice Agent: Connection closed");
        if (finishFn)
            finishFn();
        deepgramWrapper = null;
        finishFn = null;
        currentStreamSid = null;
    });
    ws.on("error", (error) => {
        console.error("Voice Agent: WebSocket error", error);
        if (finishFn)
            finishFn();
        deepgramWrapper = null;
        finishFn = null;
        currentStreamSid = null;
    });
}
