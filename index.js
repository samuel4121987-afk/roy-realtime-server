Replace the entire index.js NOW with the GPT-4 stable version (this will break your current system until you test it)const express = require("express");
const axios = require("axios");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY");
  process.exit(1);
}

const ROY_PROMPT = `You are Roy, a male voice receptionist for the 24/7 AI Assistant service.

You MUST follow these rules:
- Keep ALL responses very short (1-2 sentences maximum)
- Use contractions (I'm, we'll, don't)
- Be casual, friendly, and confident
- Never be robotic or overly formal
- Focus only on the main caller, ignore background noise
- If caller says filler words (yeah, uh-huh, okay) while you're speaking, ignore them
- Only respond to real questions or statements
- If asked about services: "24/7 AI Assistant provides continuous receptionist coverage for hotels, vacation rentals, medical clinics, hair salons, spas, small businesses, and professional services. We handle bookings, reservations, lead capture, and customer inquiries at all hours."
- If caller expresses interest, gather: name, email, phone number, business type
- Before ending, confirm any collected contact information
- If asked directly, be honest you're the virtual receptionist for 24/7 AI

ALWAYS keep responses SHORT and NATURAL.`;

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/", (_req, res) => res.status(200).send("OK"));

// Store conversation history per call
const conversations = new Map();

app.post("/incoming-call", (req, res) => {
  const callSid = req.body.CallSid;
  console.log("📞 Incoming call:", callSid);

  // Initialize conversation with greeting
  conversations.set(callSid, [
    { role: "system", content: ROY_PROMPT },
    { role: "assistant", content: "24/7 AI, this is Roy. How can I help you?" }
  ]);

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">24/7 AI, this is Roy. How can I help you?</Say>
  <Gather input="speech" action="/handle-speech" method="POST" speechTimeout="2" speechModel="phone_call" enhanced="true">
    <Pause length="10"/>
  </Gather>
  <Redirect>/handle-speech</Redirect>
</Response>`;

  res.type("text/xml").send(twiml);
});

app.post("/handle-speech", async (req, res) => {
  const callSid = req.body.CallSid;
  const speechResult = req.body.SpeechResult;

  console.log("🎤 Speech from", callSid, ":", speechResult);

  // Get conversation history
  let conversation = conversations.get(callSid) || [
    { role: "system", content: ROY_PROMPT }
  ];

  if (!speechResult || speechResult.trim() === "") {
    // No speech detected - ask again
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">I'm sorry, I didn't catch that. Could you repeat?</Say>
  <Gather input="speech" action="/handle-speech" method="POST" speechTimeout="2" speechModel="phone_call" enhanced="true">
    <Pause length="10"/>
  </Gather>
  <Say voice="Polly.Matthew">Thank you for calling. Goodbye.</Say>
  <Hangup/>
</Response>`;
    return res.type("text/xml").send(twiml);
  }

  // Check for filler words - ignore them
  const fillerWords = ["yeah", "yep", "okay", "ok", "uh-huh", "mm-hmm", "sure", "right"];
  const isFillerOnly = fillerWords.includes(speechResult.toLowerCase().trim());

  if (isFillerOnly) {
    // Ignore filler, continue listening
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="/handle-speech" method="POST" speechTimeout="2" speechModel="phone_call" enhanced="true">
    <Pause length="10"/>
  </Gather>
  <Redirect>/handle-speech</Redirect>
</Response>`;
    return res.type("text/xml").send(twiml);
  }

  // Add user message to conversation
  conversation.push({ role: "user", content: speechResult });

  try {
    // Call GPT-4 stable API
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4",
        messages: conversation,
        temperature: 0.7,
        max_tokens: 150 // Keep responses short
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
    conversations.set(callSid, conversation);

    // Check if conversation should end
    const endPhrases = ["goodbye", "bye", "thank you for calling", "have a great day"];
    const shouldEnd = endPhrases.some(phrase => aiResponse.toLowerCase().includes(phrase));

    let twiml;
    if (shouldEnd) {
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">${aiResponse}</Say>
  <Hangup/>
</Response>`;
    } else {
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">${aiResponse}</Say>
  <Gather input="speech" action="/handle-speech" method="POST" speechTimeout="2" speechModel="phone_call" enhanced="true">
    <Pause length="10"/>
  </Gather>
  <Redirect>/handle-speech</Redirect>
</Response>`;
    }

    res.type("text/xml").send(twiml);

  } catch (error) {
    console.error("❌ OpenAI API error:", error.response?.data || error.message);
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">I'm sorry, I'm having technical difficulties. Please call back later.</Say>
  <Hangup/>
</Response>`;
    res.type("text/xml").send(twiml);
  }
});

// Cleanup old conversations (prevent memory leak)
setInterval(() => {
  const now = Date.now();
  for (const [callSid, conversation] of conversations.entries()) {
    // Remove conversations older than 1 hour
    if (now - conversation.timestamp > 3600000) {
      conversations.delete(callSid);
    }
  }
}, 300000); // Check every 5 minutes

const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Roy GPT-4 Stable Server listening on", PORT);
});
