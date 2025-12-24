const express = require("express");
const axios = require("axios");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY");
  process.exit(1);
}

const ROY_PROMPT = `
You are Roy, a male voice receptionist for the 24/7 AI Assistant service.

You MUST follow these rules:
- Keep ALL responses very short (1-2 sentences maximum)
- Use contractions (I'm, we'll, don't)
- Be casual, friendly, and confident
- Never be robotic or overly formal
- Focus only on the main caller, ignore background noise
- If caller says filler words (yeah, uh-huh, okay) while you're speaking, ignore them
- Only respond to real questions or statements

ALWAYS keep responses SHORT and NATURAL.
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
    console.error("❌ Error calling GPT-4:", error.response?.data || error.message);
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Google.en-US-Neural2-D">I'm sorry, I'm having technical difficulties. Please try again later.</Say>
  <Hangup/>
</Response>`;
    
    res.type("text/xml").send(twiml);
  }
});

const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, "0.0.0.0", () => console.log("🚀 Listening on", PORT));
