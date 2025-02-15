// routes/voice-agent/handler.ts
import WebSocket from "ws"
import { createClient, AgentEvents } from "@deepgram/sdk"
import fs from "fs"

const deepgram = createClient(process.env.DEEPGRAM_API_KEY)

export function handleDeepgramVoiceAgent(ws: WebSocket, lang: string) {
  console.log("Setting up Deepgram Voice Agent")
  const connection = deepgram.agent()
  let keepAliveInterval: NodeJS.Timeout
  let currentStreamSid: string | null = null

  let isAgentSpeaking = false
  let hasIssuedWarning = false
  let silenceWarningTimeout: NodeJS.Timeout
  let silenceDisconnectTimeout: NodeJS.Timeout

  function resetSilenceTimers() {
    // Don't set new timers if the agent is speaking
    if (isAgentSpeaking) {
      console.log("Agent is speaking, not setting silence timers")
      return
    }

    // Clear existing timeouts
    clearTimers()

    // Only set warning timer if we haven't already issued a warning
    if (!hasIssuedWarning) {
      // Set new timeouts
      silenceWarningTimeout = setTimeout(() => {
        // Double check agent isn't speaking before warning
        if (!isAgentSpeaking) {
          console.log("No audio detected for 15 seconds, sending warning")
          hasIssuedWarning = true
          connection.injectAgentMessage("Are you still there?")

          // Set disconnect timeout after warning
          silenceDisconnectTimeout = setTimeout(() => {
            // Final check that agent isn't speaking
            if (!isAgentSpeaking) {
              console.log("No response after warning, ending call")
              connection.injectAgentMessage(
                "Since I haven't heard from you, I'll end the call now. Feel free to call back when you're ready. Goodbye!"
              )
              setTimeout(() => {
                ws.close()
              }, 6000) // Give time for the goodbye message to be spoken
            }
          }, 7000) // 7 seconds after warning
        }
      }, 15000) // 15 seconds of silence
    }
  }

  function clearTimers() {
    if (silenceWarningTimeout) clearTimeout(silenceWarningTimeout)
    if (silenceDisconnectTimeout) clearTimeout(silenceDisconnectTimeout)
  }

  // Handle incoming Twilio messages
  function handleTwilioMessage(message: string) {
    try {
      const data = JSON.parse(message)
      //   console.log("Received Twilio event:", data.event)

      switch (data.event) {
        case "start":
          hasIssuedWarning = false // Reset warning state on new call
          resetSilenceTimers()
          currentStreamSid = data.start.streamSid
          console.log("Call started, StreamSID:", currentStreamSid)
          break

        case "media":
          if (data.media && data.media.payload) {
            // Decode base64 audio from Twilio and send to Deepgram
            const audioData = Buffer.from(data.media.payload, "base64")
            connection.send(audioData)
          }
          break

        case "stop":
          console.log("Call ended")
          currentStreamSid = null
          connection.disconnect()
          connection.removeAllListeners()
          clearTimers()
          ws.close()

          break
      }
    } catch (error) {
      console.error("Error processing Twilio message:", error)
    }
  }

  // Set up Deepgram connection handlers
  connection.on(AgentEvents.Open, async () => {
    console.log("Deepgram connection opened")
    resetSilenceTimers()
    await connection.configure({
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
          // model: "llama3-70b-8192",
          model: "gpt-4o-mini",
          instructions: `Your name is Ava. You are a helpful AI assistant answering potential customer questions over the phone. The customer may ask about products, services, or schedule a demo. You should be polite, helpful, and informative. Product information is as follows:

            ## Echo (AI Scribe)
            - Echo is an AI Scribe tool that listens to patient-doctor conversations in realtime and automatically generates clinical notes. Doctors can customize the notes that are generated using a drag and drop interface. Echo is HIPAA compliant and integrates with most EHR systems.
            - Echo is available as a subscription service with 3 tiers: Free, Individual ($100 per month) and Team ($250 per month). The Free tier includes basic features, while the Individual and Team tiers include additional features like custom templates and team collaboration and the team plan includes 10 users. Team and individual plans include a 14-day free trial.

            ## Call Center
            - The AI Call Center is a virtual call center that uses AI to handle incoming calls. It can answer frequently asked questions, route calls to the appropriate department, schedule and reschedule appointments, and answer questions specific to each patient (such as medication refills and insurance coverage). The AI can also send texts using 2 way texting. The Call Center also includes an in app interface for nurses and other office staff to see the call history, notes, the AI's responses, what actions it took, and they can also send text messages from the Call Center interface themselves. They can also configure appointment reminders and how early and often they are sent to patients.
            - The Call Center is available as a subscription service with custom pricing based on number of providers and call volume. The service includes a 30-day free trial. The service is HIPAA compliant and integrates with most EHR systems. The Call Center can take anywhere from 1-2 weeks to 6-8 weeks to set up depending on the complexity of the setup. The Call Center can also be customized to include additional features like custom AI voices and custom actions and webhooks.
           
            ## Efax

            - Our AI powered Efax service revolutionizes the typical fax workflow. It allows you to send and receive faxes from your computer or mobile device through our web app. The service automatically extracts key information from faxes such as patient names and date of births, insurance information, chief complaints, and more. You can also add custom labels that will automatically be intelligently assigned to the fax if it matches. For instance all faxes for headaches or diabetes will be under their apporpriate labels. This allows you to search faxes by patient, sender, or by what the fax was sent for, giving you more control and ability to see all the analytics about referrals sent to your practice and who is sending you patients. Users can purchase fax numbers from our platform or port their existing fax numbers to our platform, ensuring zero downtime and no need to change your fax number. 
            - The service is available as an add on subscription service with usage based pricing. The default plan is $150 per month and includes 3000 fax pages per month. Additional pages are billed at $0.06 per outbound page and $0.075 per inbound page. Additional fax numbers are billed at $10 per month per number. The service includes a 14-day free trial. The service is HIPAA compliant and integrates with most EHR systems. The service can be set up in as little as 1-2 days. The service can also be customized to include additional features like custom labels and webhooks.

            ## Digital Forms (Smartform)

            - Smartform is a patient paperwork automation tool that allows users to create custom forms with a drag and drop interface. Users can publish their forms to a public link, send them via email or text, or embed them on their website. Patients can fill out the forms on their computer or mobile device and the data is automatically saved to the user's account. Users can also set up custom notifications and alerts based on the form responses. The forms can be customized to include conditional logic, required fields, password protection, and custom branding. Some common fields used on forms include text fields, signature fields, date fields, checkboxes, medication pickers, surgery history pickers and more. The forms can be used for patient intake, consent forms, surveys, and more.

            - The best part is, Smartform is included with the Call Center and Echo subscriptions at no additional cost. Users can also purchase Smartform as a standalone service with custom pricing based on the number of forms and form submissions. 
            `,
          functions: [
            {
              name: "hang_up",
              description: "hang up the phone call when you are done.",
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
              description:
                "Leave a voicemail message that will be played to the user and then hang up.",
              parameters: {
                type: "object",
                properties: {
                  message: {
                    type: "string", // the type of the input
                    description: "The voicemail message to play to the user",
                  },
                  timeout: {
                    type: "number",
                    description:
                      "The amount of time to wait before hanging up (the timeout in seconds). Should be long enough for you to deliver the full message. no more than 20 seconds.",
                  },
                },
                // @ts-ignore
                required: ["message", "timeout"],
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
            content:
              "Hello! My name is Ava. I'm an AI voice assistant for Axon AI. I can answer any questions you may have about any products and I can even book a demo for you if you would like. How can I assist you today?",
          },
        ],
        replay: true,
      },
    })
    console.log("Deepgram Agent configured")

    // Set up keepalive
    // keepAliveInterval = setInterval(() => {
    //   console.log("Sending keepalive")
    //   void connection.keepAlive()
    // }, 5000)
  })

  //   connection.on(AgentEvents.Welcome, (message) => {
  //     console.log("Deepgram welcome message:", message)
  //     const audioFile = fs.readFileSync("./public/ava-intro.ulaw")
  //     const audioData = Buffer.from(audioFile).toString("base64")
  //     const avaMessage = {
  //       event: "media",
  //       streamSid: currentStreamSid,
  //       media: {
  //         payload: audioData,
  //       },
  //     }
  //     ws.send(JSON.stringify(avaMessage))
  //   })

  // Handle incoming audio from Deepgram
  connection.on(AgentEvents.Audio, (audio) => {
    if (!currentStreamSid) {
      console.log("No StreamSID available, cannot send audio")
      return
    }

    // Send audio back to Twilio in the expected format
    const message = {
      event: "media",
      streamSid: currentStreamSid,
      media: {
        payload: Buffer.from(audio).toString("base64"),
      },
    }
    ws.send(JSON.stringify(message))
  })

  // Handle various Deepgram events
  connection.on(AgentEvents.Error, (error) => {
    console.error("Deepgram error:", error)
  })

  connection.on(AgentEvents.UserStartedSpeaking, (message) => {
    console.error("Deepgram user started speaking:", message)
    hasIssuedWarning = false // Reset warning state when user speaks
    resetSilenceTimers()
    //interupt the agent. make it stop speaking
    ws.send(
      JSON.stringify({
        event: "clear",
        streamSid: currentStreamSid,
      })
    )
  })
  connection.on(AgentEvents.AgentAudioDone, (message) => {
    console.error("Deepgram agent audio done:", message)
    isAgentSpeaking = false
    // Reset silence detection after agent finishes speaking
    if (!hasIssuedWarning) {
      resetSilenceTimers()
    }
  })
  connection.on(AgentEvents.AgentStartedSpeaking, (message) => {
    console.error("Deepgram agent started speaking:", message)
    isAgentSpeaking = true
    // Clear timers while agent is speaking
    clearTimers()
  })

  connection.on(AgentEvents.AgentThinking, (message) => {
    console.error("Deepgram agent thinking:", message)
    // Consider the agent as speaking while thinking to prevent timeout
    isAgentSpeaking = true
  })

  // Log agent messages for debugging
  connection.on(AgentEvents.ConversationText, (message) => {
    console.log("User message:", message)
  })

  connection.on(AgentEvents.FunctionCallRequest, (message) => {
    console.log("Function Call Request:", message)
    console.log("Calling function:", message.function_name)
    if (message.function_name === "hang_up") {
      connection.injectAgentMessage(
        "If you have any further questions, please don't hesitate to call us back. Goodbye!"
      )
      setTimeout(() => {
        ws.close()
      }, 5500)
    }
    if (message.function_name === "voicemail_detected") {
      connection.injectAgentMessage(message.input.message)
      setTimeout(() => {
        ws.close()
      }, message.input.timeout * 1000 || 10000)
    }
  })

  connection.on(AgentEvents.FunctionCalling, (message) => {
    console.log("Function Calling:", message)
  })

  connection.on(AgentEvents.SettingsApplied, (message) => {
    console.log("Settings applied:", message)
  })

  connection.on(AgentEvents.Close, () => {
    console.log("Deepgram connection closed")
    // clearInterval(keepAliveInterval)
    currentStreamSid = null
    connection.removeAllListeners()
    ws.close()
    clearTimers()
  })

  // Handle WebSocket events
  ws.on("message", (message: WebSocket.Data) => {
    handleTwilioMessage(message.toString())
  })

  ws.on("close", () => {
    console.log("Twilio connection closed")
    connection.removeAllListeners()
    connection.disconnect()
    // clearInterval(keepAliveInterval)
    currentStreamSid = null
    clearTimers()
  })

  ws.on("error", (error) => {
    console.error("WebSocket error:", error)
    connection.removeAllListeners()
    connection.disconnect()
    // clearInterval(keepAliveInterval)
    currentStreamSid = null
    clearTimers()
  })
}
