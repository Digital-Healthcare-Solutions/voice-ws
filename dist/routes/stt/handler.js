"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSTT = handleSTT;
const sdk_1 = require("@deepgram/sdk");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const deepgramClient = (0, sdk_1.createClient)(process.env.DEEPGRAM_API_KEY);
let keepAlive = null;
const KEEP_ALIVE_INTERVAL = 10 * 1000; // 10 seconds
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
    console.log("Setting up Deepgram connection...");
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
    let keepAliveInterval = null;
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
        if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
        }
    });
    deepgram.addListener(sdk_1.LiveTranscriptionEvents.Error, (error) => {
        console.error("Deepgram: Error received", error);
        ws.send(JSON.stringify({ error: "Deepgram error occurred" }));
    });
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
    return deepgram;
};
function handleSTT(ws, lang, keywords, utteranceTime, findAndReplaceStrings) {
    console.log("STT: New WebSocket connection established");
    let deepgramWrapper = setupDeepgram(ws, lang, keywords, utteranceTime, findAndReplaceStrings);
    let messageCount = 0;
    ws.on("message", (message) => {
        messageCount++;
        console.log(`STT: Received audio data (Message #${messageCount})`);
        console.log(`Deepgram Ready State: ${deepgramWrapper.getReadyState()}`);
        //looking for if message === {type:"ping"}
        if (message.toString().includes("ping")) {
            console.log("STT: Received ping message");
            const parsedMessage = JSON.parse(message.toString());
            if (parsedMessage.type === "ping") {
                console.log("STT: Received ping message");
                ws.send(JSON.stringify({ type: "pong" }));
                return;
            }
        }
        if (deepgramWrapper.getReadyState() === 1 /* OPEN */) {
            console.log(`STT: Sending data to Deepgram (Message #${messageCount})`);
            console.log("ws: data sent to deepgram");
            deepgramWrapper.send(message);
        }
        else if (deepgramWrapper.getReadyState() >= 2 /* 2 = CLOSING, 3 = CLOSED */) {
            console.log("ws: data couldn't be sent to deepgram");
            console.log("ws: retrying connection to deepgram");
            /* Attempt to reopen the Deepgram connection */
            deepgramWrapper.requestClose();
            deepgramWrapper.removeAllListeners();
            deepgramWrapper = setupDeepgram(ws, lang, keywords, utteranceTime, findAndReplaceStrings);
        }
        else {
            console.log(`STT: Cannot send to Deepgram. Current state: ${deepgramWrapper.getReadyState()} (Message #${messageCount})`);
        }
    });
    ws.on("close", () => {
        console.log("STT: WebSocket connection closed");
        deepgramWrapper.requestClose();
        deepgramWrapper.removeAllListeners();
        //@ts-ignore
        deepgramWrapper = null;
    });
    ws.on("error", (error) => {
        console.error("STT: WebSocket error", error);
    });
}
