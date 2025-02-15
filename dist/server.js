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
// server.ts
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const ws_1 = __importDefault(require("ws"));
const handler_1 = require("./routes/stt/handler");
const handler_2 = require("./routes/tts/handler");
const crypto_1 = require("./utils/crypto");
const handler_3 = require("./routes/voice-agent-custom/handler");
const VoiceResponse_1 = __importDefault(require("twilio/lib/twiml/VoiceResponse"));
const handler_4 = require("./routes/voice-agent-deepgram-demo/handler");
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const wss = new ws_1.default.Server({ noServer: true });
// Express middleware
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// HTTP Routes
app.get("/", (req, res) => {
    res.send("Server is running");
});
// Express route for incoming Twilio calls
app.post("/call/voice-agent-deepgram-demo", 
// twilio.webhook(),
(req, res) => {
    var _a;
    const twiml = new VoiceResponse_1.default();
    const connect = twiml.connect();
    //get api_key from request
    const apiKey = (_a = req.headers.authorization) === null || _a === void 0 ? void 0 : _a.split(" ")[1];
    const stream = connect.stream({
        url: process.env.NODE_ENV === "production"
            ? `wss://${process.env.SERVER_DOMAIN}/voice-agent-deepgram-demo`
            : `wss://${process.env.SERVER_DOMAIN_DEV}/voice-agent-deepgram-demo`,
    });
    stream.parameter({
        name: "apiKey",
        value: apiKey,
    });
    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end(twiml.toString());
});
function validateAuth(value) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch(process.env.AUTH_SERVER_URL || "", {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${value}`,
                },
            });
            const data = yield response.json();
            return response.ok && data;
        }
        catch (error) {
            console.error("Auth error:", error);
            return false;
        }
    });
}
// Function to check if request is from Twilio
function isTwilioRequest(request) {
    // Check if X-Twilio-Signature header exists
    return !!request.headers["x-twilio-signature"];
}
server.on("upgrade", (request, socket, head) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const url = new URL(request.url || "", `http://${request.headers.host}`);
        const pathname = url.pathname;
        // Special handling for voice-agent when it's a Twilio request
        if (pathname === "/voice-agent-deepgram-demo" && isTwilioRequest(request)) {
            console.log("Handling Twilio voice agent connection");
            wss.handleUpgrade(request, socket, head, (ws) => {
                console.log("Twilio WebSocket connection established");
                // handleVoiceAgent(ws, "en-US")
                (0, handler_4.handleDeepgramVoiceAgent)(ws, "en-US");
            });
            return;
        }
        const apiKey = url.searchParams.get("apiKey");
        const token = url.searchParams.get("token");
        const language = url.searchParams.get("lang") || "en-US";
        const keywords = ((_a = url.searchParams.get("keywords")) === null || _a === void 0 ? void 0 : _a.split(",")) || [];
        const utteranceTime = parseInt(url.searchParams.get("utteranceTime") || "1000");
        const findAndReplaceStrings = ((_b = url.searchParams.get("findAndReplace")) === null || _b === void 0 ? void 0 : _b.split(",")) || [];
        let isAuthenticated = false;
        if (token) {
            const decryptedToken = (0, crypto_1.decryptToken)(token);
            isAuthenticated = yield validateAuth(decryptedToken);
        }
        if (!isAuthenticated) {
            throw new Error("Unauthorized");
        }
        if (pathname === "/stt") {
            wss.handleUpgrade(request, socket, head, (ws) => {
                ws.send(JSON.stringify({ type: "ConnectionStatus", status: "authenticated" }));
                (0, handler_1.handleSTT)(ws, language, keywords, utteranceTime, findAndReplaceStrings);
            });
        }
        else if (pathname === "/tts") {
            wss.handleUpgrade(request, socket, head, (ws) => {
                ws.send(JSON.stringify({ type: "ConnectionStatus", status: "authenticated" }));
                (0, handler_2.handleTTS)(ws);
            });
        }
        else if (pathname === "/voice-agent") {
            console.log("Voice agent connection");
            wss.handleUpgrade(request, socket, head, (ws) => {
                ws.send(JSON.stringify({ type: "ConnectionStatus", status: "authenticated" }));
                (0, handler_3.handleVoiceAgent)(ws, language);
            });
        }
        else {
            throw new Error("Invalid pathname");
        }
    }
    catch (error) {
        console.error("Connection error:", error);
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
    }
}));
// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send("Something broke!");
});
const PORT = process.env.PORT || 5001;
// Start the server
server.listen(PORT, () => {
    console.log(`⚡️ [server]: Server is running on port ${PORT}`);
    console.log(`HTTP: http://localhost:${PORT}`);
    console.log(`WebSocket: ws://localhost:${PORT}`);
});
