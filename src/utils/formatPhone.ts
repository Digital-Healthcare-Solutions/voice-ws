export function formatToE164(phoneNumber: String, defaultCountryCode = "1") {
  // Remove all non-digit characters
  let cleaned = phoneNumber.replace(/\D/g, "")

  // Check if the number already starts with a plus sign
  const startsWithPlus = phoneNumber.startsWith("+")

  // If it doesn't start with a plus, and doesn't have a country code, add the default
  if (!startsWithPlus && cleaned.length <= 10) {
    cleaned = defaultCountryCode + cleaned
  }

  // Check if the number is valid (at least 10 digits, not more than 15)
  if (cleaned.length < 10 || cleaned.length > 15) {
    return null
  }

  // Add the plus sign
  return "+" + cleaned
}
