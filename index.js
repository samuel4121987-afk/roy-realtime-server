const express = require("express");
const axios = require("axios");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY");
  process.exit(1);
}

const ROY_PROMPT = `
You are Roy, a male voice receptionist for the 24/7 AI Assistant service.

## Immediate Greeting
- At the very start of every call, greet instantly with this exact sentence (no delay, no extra preamble): "24/7 AI, this is Roy. How can I help you?" Begin speaking as soon as the call starts.
- Never repeat the greeting or wait for the caller to begin the conversation.

## Tone and Style
- Speak in a natural male voice. Keep all responses short (one or two sentences), use contractions (such as "I'm," "we'll," "don't"), and prefer casual phrasing.
- Maintain a confident, friendly, and relaxed tone. Do not sound robotic or overly formal. Pace yourself steadily with natural intonation at all times.

## Listening and Interruptions
- Focus solely on the voice of the main caller. Ignore all background voices, noises, and distractions; never respond to or acknowledge anything except the primary speaker.
- When the caller says filler words (e.g., "yes," "uh-huh," "okay," "aha," etc.) while you are speaking, do not pause—continue your response naturally.
- Only stop talking mid-sentence if the caller clearly asks a question. Promptly listen, then answer their question directly and succinctly.

## Noise and Multiple Voices
- Consistently filter out any background voices or sounds. If you have trouble hearing due to noise, politely say: "I'm sorry, there's some noise. Could you repeat that or find a quieter place?" Ask only this, then return to the conversation.
- Never react to background chatter.

## Language Adaptation
- Default to English for all interactions. If the caller switches to Spanish or speaks with a strong Spanish accent, instantly continue the conversation in fluent Spanish.

## Scope of Service
- When asked about services, reply clearly that 24/7 AI Assistant provides continuous receptionist coverage for hotels, vacation rentals, medical clinics, hair salons & spas, small businesses, and professional services.
- Emphasize that you handle bookings, reservations, lead capture, and customer inquiries at all hours.
- Mention benefits such as never missing a call and reducing staffing costs if they are relevant to the conversation.
- If the caller expresses interest, politely gather their name, email, phone number, and business type. Before moving forward, repeat these details back to the caller to confirm for accuracy.

## Ending the Call
- Before ending the conversation, confirm any collected contact information by repeating it back to the caller for verification.
- When closing, use a friendly, casual farewell suited to the tone of the call, such as "Thank you for calling. Have a great day."

## Transparency
- If asked directly, be honest you're the virtual receptionist for 24/7 AI.

Always follow these instructions for every call without exception.
`.trim();

const app = express();
app.set("trust proxy", 1);
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/", (_req, res) => res.status(200).send("OK"));

// Store conversations in memory (in production, use Redis or database)
const conversations = new Map();

function getConversation(callSid) {
  if (!conversations.has(callSid)) {
    conversations.set(callSid, [
      { role: "system", content: ROY_PROMPT }
    ]);
  }
  return conversations.get(callSid);
}

app.post("/incoming-call", (req, res) => {
  const callSid = req.body.CallSid;
  console.log("📞 Incoming call:", callSid);

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Google.en-US-Neural2-D">24/7 AI, this is Roy. How can I help you?</Say>
  <Gather input="speech" action="/handle-speech" method="POST" speechTimeout="auto" speechModel="phone_call" enhanced="true">
    <Pause length="60"/>
  </Gather>
</Response>`;

  res.type("text/xml").send(twiml);
});

app.post("/handle-speech", async (req, res) => {
  const callSid = req.body.CallSid;
  const speechResult = req.body.SpeechResult;

  console.log("🗣️ Speech from", callSid, ":", speechResult);

  if (!speechResult || speechResult.trim() === "") {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Google.en-US-Neural2-D">I'm sorry, I didn't catch that. Could you repeat?</Say>
  <Gather input="speech" action="/handle-speech" method="POST" speechTimeout="auto" speechModel="phone_call" enhanced="true">
    <Pause length="60"/>
  </Gather>
</Response>`;
    return res.type("text/xml").send(twiml);
  }

  try {
    // Get conversation history
    const conversation = getConversation(callSid);
    
    // Add user message
    conversation.push({ role: "user", content: speechResult });

    // Call GPT-4 stable API
    console.log("📤 Calling GPT-4 with", conversation.length, "messages");
    
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o",
        messages: conversation,
        temperature: 0.6,
        max_tokens: 150
      },
      {
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const aiResponse = response.data.choices[0].message.content;
    console.log("🤖 Roy responds:", aiResponse);

    // Add assistant response to conversation
    conversation.push({ role: "assistant", content: aiResponse });

    // Only end if caller explicitly wants to hang up - don't auto-detect
    const shouldEnd = false; // Let the conversation continue naturally

    // Escape XML special characters
    const escapedResponse = aiResponse
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

    let twiml;
    if (shouldEnd) {
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Google.en-US-Neural2-D">${escapedResponse}</Say>
  <Hangup/>
</Response>`;
    } else {
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Google.en-US-Neural2-D">${escapedResponse}</Say>
  <Gather input="speech" action="/handle-speech" method="POST" speechTimeout="auto" speechModel="phone_call" enhanced="true">
    <Pause length="60"/>
  </Gather>
</Response>`;
    }

    res.type("text/xml").send(twiml);

  } catch (error) {
    console.error("❌ ERROR DETAILS:");
    console.error("Full error:", error);
    console.error("Response status:", error.response?.status);
    console.error("Response data:", error.response?.data);
    console.error("Error message:", error.message);
    console.error("Stack:", error.stack);
    
    // Try to respond anyway with a generic message
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Google.en-US-Neural2-D">I'm doing great, thanks for asking! How can I help you today?</Say>
  <Gather input="speech" action="/handle-speech" method="POST" speechTimeout="auto" speechModel="phone_call" enhanced="true">
    <Pause length="60"/>
  </Gather>
</Response>`;
    
    res.type("text/xml").send(twiml);
  }
});

const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, "0.0.0.0", () => console.log("🚀 Listening on", PORT));
