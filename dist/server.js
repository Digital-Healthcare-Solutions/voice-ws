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
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const ws_1 = __importDefault(require("ws"));
const handler_1 = require("./routes/stt/handler");
const handler_2 = require("./routes/tts/handler");
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const wss = new ws_1.default.Server({ noServer: true });
const AUTH_SERVER_URL = process.env.AUTH_SERVER_URL || "";
function validateToken(token) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch(AUTH_SERVER_URL, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
            });
            const data = yield response.json();
            return data; // Adjust based on your auth server's response structure
        }
        catch (error) {
            console.error("Token validation error:", error);
            return false;
        }
    });
}
server.on("upgrade", (request, socket, head) => __awaiter(void 0, void 0, void 0, function* () {
    let pathname = null;
    let token = null;
    let langauge = "en-US";
    try {
        const url = new URL(request.url || "", `http://${request.headers.host}`);
        pathname = url.pathname;
        token = url.searchParams.get("token");
        langauge = url.searchParams.get("lang") || "en-US";
        const isValidToken = token ? yield validateToken(token) : false;
        if (pathname === "/stt") {
            console.log("STT route");
            wss.handleUpgrade(request, socket, head, (ws) => {
                if (!isValidToken || !token) {
                    ws.close(3000, "Invalid token");
                    return;
                }
                ws.send(JSON.stringify({ type: "ConnectionStatus", status: "authenticated" }));
                (0, handler_1.handleSTT)(ws, langauge);
            });
        }
        else if (pathname === "/tts") {
            console.log("TTS route");
            wss.handleUpgrade(request, socket, head, (ws) => {
                if (!isValidToken || !token) {
                    ws.close(3000, "Invalid token");
                    return;
                }
                ws.send(JSON.stringify({ type: "ConnectionStatus", status: "authenticated" }));
                (0, handler_2.handleTTS)(ws);
            });
        }
        else {
            throw new Error("Invalid pathname");
        }
    }
    catch (error) {
        if (error.message === "Invalid token" ||
            error.message === "No token provided") {
            console.error("Invalid token");
            socket.write("HTTP/1.1 401 Web Socket Protocol Handshake\r\n" +
                "Upgrade: WebSocket\r\n" +
                "Connection: Upgrade\r\n" +
                "\r\n");
        }
        console.error("Authentication error:", error);
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
    }
}));
app.get("/", (req, res) => {
    res.send("Status: OK");
});
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`⚡️ [server]: Server is running on port ${PORT}`);
});
