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
exports.handleDeepgramVoiceAgent = handleDeepgramVoiceAgent;
const sdk_1 = require("@deepgram/sdk");
const cal_dot_com_apis_1 = require("../../utils/cal-dot-com-apis");
const moment_1 = __importDefault(require("moment"));
const deepgram = (0, sdk_1.createClient)(process.env.DEEPGRAM_API_KEY);
function handleDeepgramVoiceAgent(ws, lang) {
    console.log("Setting up Deepgram Voice Agent");
    const connection = deepgram.agent();
    let keepAliveInterval;
    let currentStreamSid = null;
    let hasIssuedWarning = false;
    let silenceWarningTimeout;
    let silenceDisconnectTimeout;
    let isAgentResponding = false;
    function startSilenceDetection() {
        // Clear any existing timeouts
        clearTimers();
        // Don't set timers if the agent is in the middle of responding
        if (isAgentResponding) {
            return;
        }
        // Only set warning timer if we haven't warned yet
        if (!hasIssuedWarning) {
            silenceWarningTimeout = setTimeout(() => {
                if (!isAgentResponding) {
                    console.log("No interaction detected, sending warning");
                    hasIssuedWarning = true;
                    connection.injectAgentMessage("Are you still there?");
                    silenceDisconnectTimeout = setTimeout(() => {
                        if (!isAgentResponding) {
                            console.log("No response after warning, ending call");
                            connection.injectAgentMessage("Since I haven't heard from you, I'll end the call now. Feel free to call back when you're ready. Goodbye!");
                            setTimeout(() => {
                                ws.close();
                            }, 6000);
                        }
                    }, 7000);
                }
            }, 15000);
        }
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
                    currentStreamSid = data.start.streamSid;
                    console.log("Call started, StreamSID:", currentStreamSid);
                    console.log("Day of the week:", (0, moment_1.default)().utcOffset("America/Chicago").format("dddd"));
                    console.log("todays date:", (0, moment_1.default)().utcOffset("America/Chicago").format("YYYY/MM/DD"));
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
        startSilenceDetection();
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
                    // max_tokens: 200,
                    // model: "llama3-70b-8192",
                    model: "gpt-4o-mini",
                    instructions: `Your name is Ava. You are a helpful AI assistant answering potential customer questions over the phone. The customer may ask about products, services, or schedule a demo. You should be polite, helpful, and informative. For demos, the current date is $${(0, moment_1.default)()
                        .utcOffset("America/Chicago")
                        .format("YYYY/MM/DD")} and the current day of the week is ${(0, moment_1.default)()
                        .utcOffset("America/Chicago")
                        .format("dddd")}. If the user says for instance 'next week works best for me', you should search all the dates for that specfic week. You should never list out all dates but just suggest a few of them (max 3). You do not need to know what products they are interested in to suggest available time slots. Some dates are as follows: tommorow is ${(0, moment_1.default)()
                        .add(1, "days")
                        .utcOffset("America/Chicago")
                        .format("dddd")}, ${(0, moment_1.default)()
                        .utcOffset("America/Chicago")
                        .add(1, "days")
                        .format("YYYY/MM/DD")}, the next day is ${(0, moment_1.default)()
                        .add(2, "days")
                        .utcOffset("America/Chicago")
                        .format("dddd")}, ${(0, moment_1.default)()
                        .utcOffset("America/Chicago")
                        .add(2, "days")
                        .format("YYYY/MM/DD")}, and the day after that is ${(0, moment_1.default)()
                        .add(3, "days")
                        .utcOffset("America/Chicago")
                        .format("dddd")}, ${(0, moment_1.default)()
                        .utcOffset("America/Chicago")
                        .add(3, "days")
                        .format("YYYY/MM/DD")}, and the day after that is ${(0, moment_1.default)()
                        .add(4, "days")
                        .utcOffset("America/Chicago")
                        .format("dddd")}, ${(0, moment_1.default)()
                        .utcOffset("America/Chicago")
                        .add(4, "days")
                        .format("YYYY/MM/DD")}, and the day after that is ${(0, moment_1.default)()
                        .add(5, "days")
                        .utcOffset("America/Chicago")
                        .format("dddd")}, ${(0, moment_1.default)()
                        .utcOffset("America/Chicago")
                        .add(5, "days")
                        .format("YYYY/MM/DD")}., and the day after that is ${(0, moment_1.default)()
                        .add(6, "days")
                        .utcOffset("America/Chicago")
                        .format("dddd")}, ${(0, moment_1.default)()
                        .utcOffset("America/Chicago")
                        .add(6, "days")
                        .format("YYYY/MM/DD")}, and the day after that is ${(0, moment_1.default)()
                        .add(7, "days")
                        .utcOffset("America/Chicago")
                        .format("dddd")}, ${(0, moment_1.default)()
                        .utcOffset("America/Chicago")
                        .add(7, "days")
                        .format("YYYY/MM/DD")}. When listing appointments to the user you should reply with for instance '10 o clock AM' instead of '10:00 AM'.
            
          
          Product information is as follows:

            ## Echo 
            - Echo is an AI Scribe tool that listens to patient-doctor conversations in realtime and automatically generates clinical notes. Doctors can customize the notes that are generated using a drag and drop interface. Echo is HIPAA compliant and integrates with most EHR systems.
            - Echo is available as a subscription service with 3 tiers: Free, Individual ($100 per month) and Team ($250 per month). The Free tier includes basic features, while the Individual and Team tiers include additional features like custom templates and team collaboration and the team plan includes 10 users. Team and individual plans include a 14-day free trial.

            ## Call Center
            - The AI Call Center is a virtual call center that uses AI to handle incoming calls. It can answer frequently asked questions, route calls to the appropriate department, schedule and reschedule appointments, and answer questions specific to each patient (such as medication refills and insurance coverage). The AI can also send texts using 2 way texting. The Call Center also includes an in app interface for nurses and other office staff to see the call history, notes, the AI's responses, what actions it took, and they can also send text messages from the Call Center interface themselves. They can also configure appointment reminders and how early and often they are sent to patients.
            - The Call Center is available as a subscription service with custom pricing based on number of providers and call volume. The service includes a 30-day free trial. The service is HIPAA compliant and integrates with most EHR systems. The Call Center can take anywhere from 1-2 weeks to 6-8 weeks to set up depending on the complexity of the setup. The Call Center can also be customized to include additional features like custom AI voices and custom actions and webhooks.
           
            ## Efax

            - Our AI powered Efax service revolutionizes the typical fax workflow. It allows you to send and receive faxes from your computer or mobile device through our web app. The service automatically extracts key information from faxes such as patient names and date of births, insurance information, chief complaints, and more. You can also add custom labels that will automatically be intelligently assigned to the fax if it matches. For instance all faxes for headaches or diabetes will be under their apporpriate labels. This allows you to search faxes by patient, sender, or by what the fax was sent for, giving you more control and ability to see all the analytics about referrals sent to your practice and who is sending you patients. Users can purchase fax numbers from our platform or port their existing fax numbers to our platform, ensuring zero downtime and no need to change your fax number. 
            - The service is available as an add on subscription service with usage based pricing. The default plan is $150 per month and includes 3000 fax pages per month. Additional pages are billed at $0.06 per outbound page and $0.075 per inbound page. Additional fax numbers are billed at $10 per month per number. The service includes a 14-day free trial. The service is HIPAA compliant and integrates with most EHR systems. The service can be set up in as little as 1-2 days. The service can also be customized to include additional features like custom labels and webhooks.

            ## Digital Forms 

            - Smartform is a patient paperwork automation tool that allows users to create custom forms with a drag and drop interface. Users can publish their forms to a public link, send them via email or text, or embed them on their website. Patients can fill out the forms on their computer or mobile device and the data is automatically saved to the user's account. Users can also set up custom notifications and alerts based on the form responses. The forms can be customized to include conditional logic, required fields, password protection, and custom branding. Some common fields used on forms include text fields, signature fields, date fields, checkboxes, medication pickers, surgery history pickers and more. The forms can be used for patient intake, consent forms, surveys, and more.

            - The best part is, Smartform is included with the Call Center and Echo subscriptions at no additional cost. Users can also purchase Smartform as a standalone service with custom pricing based on the number of forms and form submissions. 
            `,
                    functions: [
                        {
                            name: "hang_up",
                            description: "hang up the phone call when you the user is done with questions, or after you have called the book_time_slot function and there are no further questions. Do niot hang up abruptly on the user.",
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
                                        type: "string",
                                        description: "The voicemail message to play to the user",
                                    },
                                    timeout: {
                                        type: "number",
                                        description: "The amount of time to wait before hanging up (the timeout in seconds). Should be long enough for you to deliver the full message. no more than 20 seconds.",
                                    },
                                },
                                // @ts-ignore
                                required: ["message", "timeout"],
                            },
                        },
                        {
                            name: "get_available_time_slots",
                            description: "Get the available time slots for a given date range. You should call this function first when the user asks to schedule a demo. After you get the available time slots, you should present a few options to the user and ask them to choose one." +
                                `the current date is ${(0, moment_1.default)()
                                    .utcOffset("America/Chicago")
                                    .format("YYYY/MM/DD")} and the current day of the week is  ${(0, moment_1.default)()
                                    .utcOffset("America/Chicago")
                                    .format("dddd")}`,
                            parameters: {
                                type: "object",
                                properties: {
                                    start: {
                                        type: "string",
                                        description: "The start date for the time slots to search for. (in YYYY-MM-DD format)",
                                    },
                                    end: {
                                        type: "string",
                                        description: "The end date for the time slots to search for. (in YYYY-MM-DD format)",
                                    },
                                },
                                // @ts-ignore
                                required: ["start", "end"],
                            },
                        },
                        {
                            name: "book_time_slot",
                            description: `Book a time slot for a demo. You may need the users name, email, and phone number before calling this. You should call this function after the user has chosen a time slot and you have confirmed it with them. You should confirm the booking with the user and provide any additional information they may need. You should confirm their email before calling this function.`,
                            parameters: {
                                type: "object",
                                properties: {
                                    start: {
                                        type: "string",
                                        description: "The start date for the time slot to book. (in YYYY-MM-DDTHH:mm:ssZ format)",
                                    },
                                    name: {
                                        type: "string",
                                        description: "The name of the person booking the demo",
                                    },
                                    phoneNumber: {
                                        type: "string",
                                        description: "The phone number of the person booking the demo",
                                    },
                                    email: {
                                        type: "string",
                                        description: "The email of the person booking the demo",
                                    },
                                    notes: {
                                        type: "string",
                                        description: "Any additional notes or comments for the booking (made by you, the agent)",
                                    },
                                },
                                // @ts-ignore
                                required: ["start", "name", "phoneNumber", "email", "notes"],
                            },
                        },
                        {
                            name: "confirm_email",
                            description: "Confirm the email address of the user. You should call this function after the user has provided their email address.You should reformat the user provided email text to an actual email (ie. John doe sixty seven at hot mail dot com -> johndoe67@hotmail.com).",
                            parameters: {
                                type: "object",
                                properties: {
                                    emailToConfirm: {
                                        type: "string",
                                        description: "The email address to confirm. Read this back to the user to confirm the email.",
                                    },
                                },
                                // @ts-ignore
                                required: ["emailToConfirm"],
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
    // Handle incoming audio from Deepgram
    connection.on(sdk_1.AgentEvents.Audio, (audio) => {
        if (!currentStreamSid) {
            console.log("No StreamSID available, cannot send audio");
            return;
        }
        // Send audio to Twilio
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
        console.log("Deepgram error:", error);
    });
    connection.on(sdk_1.AgentEvents.UserStartedSpeaking, (message) => {
        console.log("Deepgram user started speaking:", message);
        hasIssuedWarning = false;
        isAgentResponding = false;
        clearTimers();
        ws.send(JSON.stringify({
            event: "clear",
            streamSid: currentStreamSid,
        }));
    });
    connection.on(sdk_1.AgentEvents.AgentAudioDone, (message) => {
        console.log("Deepgram agent audio done:", message);
        // Add a small delay to ensure all audio is done
        setTimeout(() => {
            console.log("Agent response complete, starting silence detection");
            isAgentResponding = false;
            startSilenceDetection();
        }, 3000);
    });
    connection.on(sdk_1.AgentEvents.AgentStartedSpeaking, (message) => {
        console.log("Deepgram agent started speaking:", message);
        isAgentResponding = true;
        clearTimers();
    });
    connection.on(sdk_1.AgentEvents.AgentThinking, (message) => {
        console.log("Deepgram agent thinking:", message);
    });
    // Log agent messages for debugging
    connection.on(sdk_1.AgentEvents.ConversationText, (message) => {
        console.log("User message:", message);
        if (message.role === "assistant") {
            console.log("Agent starting new response");
            isAgentResponding = true;
            clearTimers();
        }
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
        if (message.function_name === "confirm_email") {
            connection.functionCallResponse({
                function_call_id: message.function_call_id,
                output: JSON.stringify({
                    confirmed: true,
                    emailToUse: message.input.emailToConfirm,
                }),
            });
        }
        if (message.function_name === "get_available_time_slots") {
            console.log("Getting available time slots");
            isAgentResponding = true;
            clearTimers();
            connection.injectAgentMessage(`I can help you with that. Let me check the available time slots for you.`);
            (0, cal_dot_com_apis_1.getAvailableTimeSlots)(message.input.start, message.input.end)
                .then((data) => {
                console.log("Available time slots:", data);
                connection.functionCallResponse({
                    function_call_id: message.function_call_id,
                    output: JSON.stringify(data),
                });
            })
                .catch((error) => {
                console.error("Error getting available time slots:", error);
                isAgentResponding = false;
                connection.injectAgentMessage(`I'm sorry, I'm having trouble finding available time slots right now.`);
            });
        }
        if (message.function_name === "book_time_slot") {
            console.log("Booking time slot");
            isAgentResponding = true;
            clearTimers();
            (0, cal_dot_com_apis_1.bookTimeSlot)(message.input.start, message.input.name, message.input.phoneNumber, message.input.email, message.input.notes)
                .then((data) => {
                console.log("Booking successful:", data);
                connection.functionCallResponse({
                    function_call_id: message.function_call_id,
                    output: JSON.stringify(data),
                });
            })
                .catch((error) => {
                console.error("Error booking time slot:", error);
                isAgentResponding = false;
                connection.injectAgentMessage(`I'm sorry, I'm having trouble booking the time slot right now.`);
            });
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
        connection.removeAllListeners();
        currentStreamSid = null;
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
        currentStreamSid = null;
        clearTimers();
    });
    ws.on("error", (error) => {
        console.error("WebSocket error:", error);
        connection.removeAllListeners();
        connection.disconnect();
        currentStreamSid = null;
        clearTimers();
    });
}
