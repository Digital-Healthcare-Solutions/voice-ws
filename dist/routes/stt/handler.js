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
const KEEP_ALIVE_INTERVAL = 10 * 1000; // 10 seconds
const setupDeepgram = (ws) => {
    console.log("Setting up Deepgram connection...");
    let deepgram = deepgramClient.listen.live({
        smart_format: true,
        model: "nova-2-medical",
        interim_results: true,
        diarize: true,
    });
    const startKeepAlive = () => {
        const keepAliveInterval = setInterval(() => {
            if (deepgram.getReadyState() === 1) {
                console.log("Deepgram: Sending keepalive");
                deepgram.keepAlive();
            }
            else {
                console.log("Deepgram: Connection not open, skipping keepalive");
                clearInterval(keepAliveInterval);
            }
        }, KEEP_ALIVE_INTERVAL);
        return keepAliveInterval;
    };
    let keepAliveInterval = null;
    deepgram.addListener(sdk_1.LiveTranscriptionEvents.Open, () => {
        console.log("Deepgram: Connected successfully");
        keepAliveInterval = startKeepAlive();
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
    return {
        send: (data) => {
            if (deepgram.getReadyState() === 1) {
                deepgram.send(data);
                return true;
            }
            return false;
        },
        getReadyState: () => deepgram.getReadyState(),
        finish: () => {
            if (keepAliveInterval) {
                clearInterval(keepAliveInterval);
            }
            deepgram.requestClose();
        },
    };
};
function handleSTT(ws) {
    console.log("STT: New WebSocket connection established");
    let deepgramWrapper = setupDeepgram(ws);
    let messageCount = 0;
    ws.on("message", (message) => {
        messageCount++;
        console.log(`STT: Received audio data (Message #${messageCount})`);
        console.log(`Deepgram Ready State: ${deepgramWrapper.getReadyState()}`);
        if (deepgramWrapper.getReadyState() === 1 /* OPEN */) {
            console.log(`STT: Sending data to Deepgram (Message #${messageCount})`);
            if (!deepgramWrapper.send(message)) {
                console.log(`STT: Failed to send data (Message #${messageCount})`);
            }
        }
        else {
            console.log(`STT: Cannot send to Deepgram. Current state: ${deepgramWrapper.getReadyState()} (Message #${messageCount})`);
        }
    });
    ws.on("close", () => {
        console.log("STT: WebSocket connection closed");
        deepgramWrapper.finish();
    });
    ws.on("error", (error) => {
        console.error("STT: WebSocket error", error);
    });
}
