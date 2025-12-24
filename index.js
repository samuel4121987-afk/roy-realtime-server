const express = require("express");
const axios = require("axios");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY");
  process.exit(1);
}

const ROY_PROMPT = `You are Roy, a male voice receptionist for the 24/7 AI Assistant service.

IMPORTANT: Keep ALL responses very short (1-2 sentences maximum). Be conversational and natural.

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

  // Initialize conversation with system prompt
  conversations.set(callSid, [
    { role: "system", content: ROY_PROMPT }
  ]);

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

  console.log("🎤 Speech from", callSid, ":", speechResult);

  // Get conversation history
  let conversation = conversations.get(callSid) || [
    { role: "system", content: ROY_PROMPT }
  ];

  if (!speechResult || speechResult.trim() === "") {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Google.en-US-Neural2-D">I'm sorry, I didn't catch that. Could you repeat?</Say>
  <Gather input="speech" action="/handle-speech" method="POST" speechTimeout="auto" speechModel="phone_call" enhanced="true">
    <Pause length="60"/>
  </Gather>
  <Say voice="Google.en-US-Neural2-D">Thank you for calling. Goodbye.</Say>
  <Hangup/>
</Response>`;
    return res.type("text/xml").send(twiml);
  }

  // Check for filler words - ignore them
  const fillerWords = ["yeah", "yep", "okay", "ok", "uh-huh", "mm-hmm", "sure", "right", "uh", "um"];
  const isFillerOnly = fillerWords.includes(speechResult.toLowerCase().trim());

  if (isFillerOnly) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="/handle-speech" method="POST" speechTimeout="auto" speechModel="phone_call" enhanced="true">
    <Pause length="60"/>
  </Gather>
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
        max_tokens: 100
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
    console.error("❌ OpenAI API error:", error.response?.data || error.message);
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Google.en-US-Neural2-D">I'm sorry, I'm having technical difficulties. Please call back later.</Say>
  <Hangup/>
</Response>`;
    res.type("text/xml").send(twiml);
  }
});

// Cleanup old conversations (prevent memory leak)
setInterval(() => {
  const now = Date.now();
  const oneHourAgo = now - 3600000;
  for (const [callSid, conversation] of conversations.entries()) {
    // Remove conversations older than 1 hour (simple cleanup)
    if (conversations.size > 100) {
      conversations.delete(callSid);
      break;
    }
  }
}, 300000); // Check every 5 minutes

const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Roy GPT-4 Stable Server listening on", PORT);
});
