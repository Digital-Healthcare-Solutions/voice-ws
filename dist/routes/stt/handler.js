"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSTT = handleSTT;
const sdk_1 = require("@deepgram/sdk");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const KEEP_ALIVE_INTERVAL = 3 * 1000; // 3 seconds
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
const setupDeepgram = (ws, lang, keywords, utteranceTime, findAndReplaceStrings) => {
    const deepgramClient = (0, sdk_1.createClient)(process.env.DEEPGRAM_API_KEY);
    console.log("Setting up Deepgram connection...");
    let keepAlive = null;
    const deepgram = deepgramClient.listen.live({
        smart_format: true,
        model: lang === "en-US" ? "nova-2-medical" : "nova-2",
        interim_results: true,
        diarize: true,
        language: lang,
        endpointing: 100,
        keywords: defaultMedicalKeywords.concat(keywords),
        replace: findAndReplaceStrings,
        utterance_end_ms: utteranceTime,
    });
    if (keepAlive)
        clearInterval(keepAlive);
    keepAlive = setInterval(() => {
        console.log("deepgram: keepalive");
        deepgram.keepAlive();
    }, KEEP_ALIVE_INTERVAL);
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
    deepgram.addListener(sdk_1.LiveTranscriptionEvents.Open, () => {
        console.log("Deepgram: Connected successfully");
    });
    deepgram.addListener(sdk_1.LiveTranscriptionEvents.Transcript, (data) => {
        console.log("Deepgram: Transcript received", data);
        ws.send(JSON.stringify(data));
    });
    deepgram.addListener(sdk_1.LiveTranscriptionEvents.Metadata, (data) => {
        console.log("Deepgram: Metadata received", data);
        ws.send(JSON.stringify({ metadata: data }));
    });
    deepgram.addListener(sdk_1.LiveTranscriptionEvents.Close, () => {
        console.log("Deepgram: Connection closed");
        if (keepAlive) {
            clearInterval(keepAlive);
        }
    });
    deepgram.addListener(sdk_1.LiveTranscriptionEvents.Error, (error) => {
        console.error("Deepgram: Error received", error);
        if (keepAlive) {
            clearInterval(keepAlive);
        }
        ws.send(JSON.stringify({ error: "Deepgram error occurred" }));
    });
    const finish = () => {
        if (keepAlive) {
            clearInterval(keepAlive);
            keepAlive = null;
        }
        deepgram.requestClose();
        deepgram.removeAllListeners();
    };
    return {
        deepgram,
        finish,
    };
};
function handleSTT(ws, lang, keywords, utteranceTime, findAndReplaceStrings) {
    console.log("STT: New WebSocket connection established");
    let { deepgram, finish } = setupDeepgram(ws, lang, keywords, utteranceTime, findAndReplaceStrings);
    let deepgramWrapper = deepgram;
    let messageCount = 0;
    ws.on("message", (message) => {
        messageCount++;
        console.log(`STT: Received audio data (Message #${messageCount})`);
        if (deepgramWrapper) {
            console.log(`Deepgram Ready State: ${deepgramWrapper.getReadyState()}`);
        }
        else {
            console.log("Deepgram Wrapper is null");
        }
        // Handle ping messages
        if (message.toString().includes("ping")) {
            console.log("STT: Received ping message");
            const parsedMessage = JSON.parse(message.toString());
            if (parsedMessage.type === "ping") {
                console.log("STT: Received ping message");
                ws.send(JSON.stringify({ type: "pong" }));
                return;
            }
        }
        if (deepgramWrapper && deepgramWrapper.getReadyState() === 1 /* OPEN */) {
            console.log(`STT: Sending data to Deepgram (Message #${messageCount})`);
            deepgramWrapper.send(message);
        }
        else if (deepgramWrapper &&
            deepgramWrapper.getReadyState() >= 2 /* 2 = CLOSING, 3 = CLOSED */) {
            console.log("STT: Deepgram connection is closing or closed, attempting to reopen.");
            finish();
            // Re-initialize Deepgram connection
            const result = setupDeepgram(ws, lang, keywords, utteranceTime, findAndReplaceStrings);
            // Update deepgramWrapper and finish with new instances
            deepgramWrapper = result.deepgram;
            finish = result.finish;
        }
        else {
            console.log(`STT: Cannot send to Deepgram. Current state: ${deepgramWrapper ? deepgramWrapper.getReadyState() : "null"} (Message #${messageCount})`);
        }
    });
    ws.on("close", () => {
        console.log("STT: WebSocket connection closed");
        finish();
        ws.removeAllListeners(); // remove all listeners
        deepgramWrapper = null;
    });
    ws.on("error", (error) => {
        console.error("STT: WebSocket error", error);
        finish();
        deepgramWrapper = null;
    });
}
