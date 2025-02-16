import moment from "moment"
import { formatToE164 } from "./formatPhone"

export const getAvailableTimeSlots = async (start: Date, end: Date) => {
  try {
    const res = await fetch(
      `https://api.cal.com/v2/slots?start=${moment(start).format(
        "YYYY-MM-DD"
      )}&end=${moment(end).format(
        "YYYY-MM-DD"
      )}&duration=30&timeZone=America/Chicago&username=jacob-owens-axon-ai&eventTypeSlug=30min`,
      {
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
      }
    )
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.message)
    }
    return data
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : String(err))
  }
}

// https://cal.com/jacob-owens-axon-ai/30min

export const bookTimeSlot = async (
  start: Date,
  name: string,
  phoneNumber: string,
  email: string,
  notes: string
) => {
  try {
    const res = await fetch("https://api.cal.com/v2/bookings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CAL_DOT_COM_API_KEY}`,
        "cal-api-version": "2024-08-13",
      },
      body: JSON.stringify({
        start: moment(start).format("YYYY-MM-DDTHH:mm:ssZ"),
        eventTypeId: parseInt(process.env.CAL_MEETING_ID!),
        attendee: {
          name: name,
          email: email,
          timeZone: "America/Chicago",
          phoneNumber: formatToE164(phoneNumber),
          language: "en",
        },
        metadata: {
          notes: "(Booked by Ava via phone call)" + " " + notes,
        },
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      console.error(data)
      throw new Error(data.message)
    }
    return data
  } catch (err) {
    console.error(err)
    throw new Error(err instanceof Error ? err.message : String(err))
  }
}
