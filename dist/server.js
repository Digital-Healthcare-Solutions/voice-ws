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
const crypto_1 = __importDefault(require("crypto"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
if (!process.env.ENCRYPTION_KEY) {
    console.error("ENCRYPTION_KEY is not set in the environment variables.");
    process.exit(1);
}
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const wss = new ws_1.default.Server({ noServer: true });
const AUTH_SERVER_URL = process.env.AUTH_SERVER_URL || "";
const PING_INTERVAL = 30000; // 30 seconds
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
// Check key length
if (Buffer.from(ENCRYPTION_KEY, "hex").length !== 32) {
    console.error("Invalid encryption key length. Key must be 32 bytes (64 hexadecimal characters).");
    process.exit(1);
}
function decrypt(text) {
    try {
        const [ivHex, encryptedHex] = text.split(":");
        if (!ivHex || !encryptedHex) {
            throw new Error("Invalid encrypted text format");
        }
        const iv = Buffer.from(ivHex, "hex");
        const encryptedText = Buffer.from(encryptedHex, "hex");
        const decipher = crypto_1.default.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY, "hex"), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString("utf8");
    }
    catch (error) {
        console.error("Decryption error:", error);
        throw error;
    }
}
function validateToken(encryptedToken) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const token = decrypt(encryptedToken);
            const response = yield fetch(AUTH_SERVER_URL, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
            });
            const data = yield response.json();
            if (!response.ok) {
                throw new Error(data.message);
            }
            return Boolean(data);
        }
        catch (error) {
            console.error("Token validation error:", error);
            return false;
        }
    });
}
function heartbeat() {
    ;
    this.isAlive = true;
}
server.on("upgrade", (request, socket, head) => __awaiter(void 0, void 0, void 0, function* () {
    let pathname = null;
    let token = null;
    try {
        const url = new URL(request.url || "", `http://${request.headers.host}`);
        pathname = url.pathname;
        token = url.searchParams.get("token");
        const isValidToken = token ? yield validateToken(token) : false;
        console.log("isValidToken", isValidToken);
        if (pathname === "/stt" || pathname === "/tts") {
            wss.handleUpgrade(request, socket, head, (ws) => {
                if (!isValidToken || !token) {
                    ws.close(3000, "Invalid token");
                    return;
                }
                ;
                ws.isAlive = true;
                ws.on("pong", heartbeat);
                const pingInterval = setInterval(() => {
                    if (ws.isAlive === false) {
                        console.log("Connection dead. Terminating.");
                        clearInterval(pingInterval);
                        return ws.terminate();
                    }
                    ;
                    ws.isAlive = false;
                    ws.ping();
                }, PING_INTERVAL);
                ws.on("close", () => {
                    clearInterval(pingInterval);
                });
                ws.send(JSON.stringify({ type: "ConnectionStatus", status: "authenticated" }));
                if (pathname === "/stt") {
                    console.log("STT route");
                    (0, handler_1.handleSTT)(ws);
                }
                else {
                    console.log("TTS route");
                    (0, handler_2.handleTTS)(ws);
                }
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
