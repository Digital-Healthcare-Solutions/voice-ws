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
exports.bookTimeSlot = exports.getAvailableTimeSlots = void 0;
const moment_1 = __importDefault(require("moment"));
const formatPhone_1 = require("./formatPhone");
const getAvailableTimeSlots = (start, end) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const res = yield fetch(`https://api.cal.com/v2/slots?start=${(0, moment_1.default)(start).format("YYYY-MM-DD")}&end=${(0, moment_1.default)(end).format("YYYY-MM-DD")}&duration=30&timeZone=America/Chicago&username=jacob-owens-axon-ai&eventTypeSlug=30min`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.CAL_DOT_COM_API_KEY}`,
                "cal-api-version": "2024-09-04",
            },
            //   body: JSON.stringify({
            //     start: start,
            //     end: end,
            //     duration: 30,
            //     timeZone: "America/Chicago",
            //     username: "jacob-owens-axon-ai",
            //     eventTypeSlug: "30min",
            //   }),
        });
        const data = yield res.json();
        if (!res.ok) {
            throw new Error(data.message);
        }
        return data;
    }
    catch (err) {
        throw new Error(err instanceof Error ? err.message : String(err));
    }
});
exports.getAvailableTimeSlots = getAvailableTimeSlots;
// https://cal.com/jacob-owens-axon-ai/30min
const bookTimeSlot = (start, name, phoneNumber, email, notes) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const res = yield fetch("https://api.cal.com/v2/bookings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.CAL_DOT_COM_API_KEY}`,
                "cal-api-version": "2024-08-13",
            },
            body: JSON.stringify({
                start: (0, moment_1.default)(start).format("YYYY-MM-DDTHH:mm:ssZ"),
                eventTypeId: parseInt(process.env.CAL_MEETING_ID),
                attendee: {
                    name: name,
                    email: email,
                    timeZone: "America/Chicago",
                    phoneNumber: (0, formatPhone_1.formatToE164)(phoneNumber),
                    language: "en",
                },
                metadata: {
                    notes: "(Booked by Ava via phone call)" + " " + notes,
                },
            }),
        });
        const data = yield res.json();
        if (!res.ok) {
            console.error(data);
            throw new Error(data.message);
        }
        return data;
    }
    catch (err) {
        console.error(err);
        throw new Error(err instanceof Error ? err.message : String(err));
    }
});
exports.bookTimeSlot = bookTimeSlot;
