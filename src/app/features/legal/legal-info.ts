/**
 * Details shown on the Privacy Policy and Terms & Conditions pages and in the text-message consent.
 * legalName must match the Brand name registered with Twilio for A2P 10DLC exactly.
 */
export const LEGAL = {
  brandName: 'AllianceTel',
  /** The name the business uses (the Brand registered with Twilio for A2P 10DLC). */
  legalName: 'AllianceTel Enterprise',
  /** Where people (and carriers) can reach us about privacy, texts or these terms. */
  contactEmail: 'support@atdirect.app',
  website: 'atdirect.app',
  effectiveDate: 'November 3, 2026',
  /** How often schedule texts go out, as stated in the consent and the SMS Terms. */
  messageFrequency: 'Message frequency varies, usually 1 to 6 messages per week',
} as const;

/** The consent wording shown before someone turns on texts (also what the SMS campaign's opt-in describes). */
export const SMS_CONSENT_TEXT =
  `By turning on text messages, you agree to receive recurring automated work schedule texts from ` +
  `${LEGAL.legalName} ` +
  `at the mobile number on your account: your weekly schedule, schedule changes, day-off decisions and team ` +
  `announcements. ${LEGAL.messageFrequency}. Message and data rates may apply. Reply STOP to opt out at any time, ` +
  `or HELP for help. Consent is not a condition of employment.`;
