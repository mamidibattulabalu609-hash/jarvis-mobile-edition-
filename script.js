/* =========================================================
   J.A.R.V.I.S PERSONAL AI ASSISTANT
   Gemini AI + Voice + Camera + Memory + Agent + Tools
   ========================================================= */

// ===================== 1. CONFIG ============================

let API_KEY = localStorage.getItem("jarvis_key") || "";

if (!API_KEY) {
  API_KEY = prompt("Enter your Gemini API Key:") || "";
  API_KEY = API_KEY.trim();

  if (API_KEY) {
    localStorage.setItem("jarvis_key", API_KEY);
  }
}

const MODELS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite"
];

const REQUEST_TIMEOUT = 15000;
const MAX_OUTPUT_TOKENS = 400;
const MEMORY_LIMIT = 20;

// ===================== 2. MEMORY ===========================

let MEMORY = [];

try {
  const saved = JSON.parse(
    localStorage.getItem("jarvis_memory") || "[]"
  );

  if (Array.isArray(saved)) {
    MEMORY = saved.filter(item =>
      item &&
      (item.role === "user" || item.role === "model") &&
      typeof item.text === "string"
    );
  }
} catch (error) {
  MEMORY = [];
  localStorage.removeItem("jarvis_memory");
}

function saveMemory() {
  try {
    localStorage.setItem(
      "jarvis_memory",
      JSON.stringify(MEMORY.slice(-MEMORY_LIMIT))
    );
  } catch (error) {
    console.warn("Memory save error:", error);
  }
}

function remember(role, text) {
  MEMORY.push({ role, text });
  MEMORY = MEMORY.slice(-MEMORY_LIMIT);
  saveMemory();
}

// ===================== 3. HTML ELEMENTS ====================

const chat = document.getElementById("chat");
const input = document.getElementById("msg");
const micBtn = document.getElementById("mic-btn");
const sendBtn = document.getElementById("send");
const camBtn = document.getElementById("cam-btn");
const imgInput = document.getElementById("img-input");
const clearBtn = document.getElementById("clear-btn");
const wakeBtn = document.getElementById("wake-btn");
const wakeStatus = document.getElementById("wake-status");

if (!chat || !input || !micBtn || !sendBtn) {
  console.error("JARVIS: Required HTML elements missing.");
}

// ===================== 4. CHAT DISPLAY =====================

function add(message, type = "ai") {
  const div = document.createElement("div");
  div.className = "msg " + type;
  div.textContent = message;

  if (chat) {
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  return div;
}

// Restore memory to chat
if (chat && MEMORY.length) {
  MEMORY.forEach(item => {
    add(
      (item.role === "user" ? "YOU: " : "J.A.R.V.I.S: ") +
      item.text,
      item.role === "user" ? "user" : "ai"
    );
  });
}

// ===================== 5. REQUEST WITH TIMEOUT =============

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT) {
  const controller = new AbortController();

  const timeoutId = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ===================== 6. GEMINI AI ========================

async function callGemini(promptText, imageData = null) {
  if (!API_KEY) {
    throw new Error("Gemini API key missing. Reload and enter your key.");
  }

  let lastError = null;

  for (const model of MODELS) {
    try {
      const parts = [];

      if (imageData) {
        parts.push({
          inline_data: {
            mime_type: imageData.mimeType,
            data: imageData.base64
          }
        });
      }

      parts.push({
        text: promptText
      });

      const url =
        "https://generativelanguage.googleapis.com/v1beta/models/" +
        model +
        ":generateContent?key=" +
        encodeURIComponent(API_KEY);

      const response = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts
              }
            ],
            generationConfig: {
              maxOutputTokens: MAX_OUTPUT_TOKENS,
              temperature: 0.5
            }
          }),
          cache: "no-store"
        },
        REQUEST_TIMEOUT
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMessage =
          data?.error?.message || "HTTP " + response.status;

        // API key / access errors are not fixed by switching models
        if (
          response.status === 400 ||
          response.status === 401 ||
          response.status === 403
        ) {
          throw new Error(errorMessage);
        }

        lastError = new Error(errorMessage);
        console.warn(model + " failed. Trying backup model.");
        continue;
      }

      const reply = data?.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();

      if (!reply) {
        lastError = new Error("Empty response from " + model);
        continue;
      }

      console.log("JARVIS model:", model);
      return reply;

    } catch (error) {
      lastError = error;

      if (
        error.message.includes("API key") ||
        error.message.includes("API_KEY") ||
        error.message.includes("400") ||
        error.message.includes("401") ||
        error.message.includes("403")
      ) {
        throw error;
      }

      console.warn(model + " error:", error.message);
    }
  }

  throw new Error(
    "Gemini is unavailable. Check your internet/API key. " +
    (lastError?.message || "")
  );
}

// ===================== 7. GEMINI CHAT ======================

async function askGemini(promptText, imageData = null) {
  const message = add("J.A.R.V.I.S: Thinking...", "ai");

  try {
    const history = MEMORY
      .slice(-12)
      .map(item =>
        (item.role === "user" ? "User: " : "JARVIS: ") +
        item.text
      )
      .join("\n");

    const systemPrompt = `
You are J.A.R.V.I.S., a helpful personal AI assistant.

Personality:
- Polite, intelligent and concise.
- Call the user Boss when natural.
- Answer in Telugu or English based on the user's language.
- Give practical and accurate answers.
- Never pretend you performed an action you did not perform.
- When analyzing an image, describe what is actually visible.
- If uncertain, clearly say so.

Previous conversation:
${history || "No previous conversation."}

Current request:
${promptText}
`;

    const reply = await callGemini(systemPrompt, imageData);

    message.textContent = "J.A.R.V.I.S: " + reply;

    remember("user", promptText);
    remember("model", reply);

    chat.scrollTop = chat.scrollHeight;

    speak(reply);

    return reply;

  } catch (error) {
    message.textContent =
      "J.A.R.V.I.S: ERROR - " + error.message;

    console.error("Gemini error:", error);
    return null;
  }
}

// ===================== 8. TOOL HANDLER =====================

async function handleTools(text) {
  const t = String(text || "").trim();
  const lower = t.toLowerCase();

  // Time
  if (/^(what('?s| is)?\s+)?(the\s+)?(current\s+)?time(\s+please)?\??$/i.test(t)) {
    return "Current time is " +
      new Date().toLocaleTimeString() +
      ", Boss.";
  }

  if (/^(what('?s| is)?\s+)?(today('?s)?\s+)?date\??$/i.test(t)) {
    return "Today is " +
      new Date().toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      }) +
      ", Boss.";
  }

  // Open YouTube
  if (/^(please\s+)?(open\s+)?youtube(\s+please)?$/i.test(t)) {
    window.open(
      "https://youtube.com/",
      "_blank",
      "noopener,noreferrer"
    );
    return "Opening YouTube, Boss.";
  }

  // Open Google
  if (/^(please\s+)?(open\s+)?google(\s+please)?$/i.test(t)) {
    window.open(
      "https://google.com/",
      "_blank",
      "noopener,noreferrer"
    );
    return "Opening Google, Boss.";
  }

  // Open a direct URL
  const urlCommand = t.match(
    /^(?:open|visit|go to)\s+(https?:\/\/\S+)$/i
  );

  if (urlCommand) {
    try {
      const destination = new URL(urlCommand[1]);

      if (!["https:", "http:"].includes(destination.protocol)) {
        return "Only HTTP and HTTPS links can be opened.";
      }

      window.open(
        destination.href,
        "_blank",
        "noopener,noreferrer"
      );

      return "Opening " + destination.hostname + ", Boss.";

    } catch (error) {
      return "That link does not look valid.";
    }
  }

  // Google search
  const googleSearch = t.match(
    /^(?:google\s+search|search\s+(?:on\s+)?google)(?:\s+for)?\s+(.+)$/i
  );

  if (googleSearch) {
    const query = googleSearch[1].trim();

    window.open(
      "https://google.com/search?q=" +
      encodeURIComponent(query),
      "_blank",
      "noopener,noreferrer"
    );

    return "Searching Google for " + query + ", Boss.";
  }

  // YouTube search / play
  const playMatch = t.match(/^play\s+(.+)$/i);

  const youtubeMatch = t.match(
    /^youtube(?:\s+search)?(?:\s+for)?\s+(.+)$/i
  );

  const searchYoutubeMatch = t.match(
    /^search\s+(?:for\s+)?youtube(?:\s+for)?\s+(.+)$/i
  );

  const videoQuery = (
    playMatch ||
    youtubeMatch ||
    searchYoutubeMatch
  )?.[1]?.trim();

  if (videoQuery) {
    window.open(
      "https://youtube.com/results?search_query=" +
      encodeURIComponent(videoQuery),
      "_blank",
      "noopener,noreferrer"
    );

    return "Searching YouTube for " + videoQuery + ", Boss.";
  }

  // Google search command
  const searchMatch = t.match(
    /^(?:search|look up)\s+(?:for\s+)?(.+)$/i
  );

  if (searchMatch) {
    const query = searchMatch[1].trim();

    window.open(
      "https://google.com/search?q=" +
      encodeURIComponent(query),
      "_blank",
      "noopener,noreferrer"
    );

    return "Searching for " + query + ", Boss.";
  }

  // Weather search
  if (/^(weather|weather today|forecast|temperature)\b/i.test(lower)) {
    window.open(
      "https://www.google.com/search?q=" +
      encodeURIComponent(t + " weather"),
      "_blank",
      "noopener,noreferrer"
    );

    return "Opening weather information, Boss.";
  }

  // News search
  if (/^(news|latest news|today news)\b/i.test(lower)) {
    window.open(
      "https://news.google.com/",
      "_blank",
      "noopener,noreferrer"
    );

    return "Opening latest news, Boss.";
  }

  // Bitcoin / crypto
  if (/^(bitcoin|crypto|btc|cryptocurrency)\b/i.test(lower)) {
    window.open(
      "https://www.google.com/search?q=" +
      encodeURIComponent(t + " price"),
      "_blank",
      "noopener,noreferrer"
    );

    return "Opening cryptocurrency information, Boss.";
  }

  return null;
}

// ===================== 9. AGENT MODE ======================

const AGENT_TOOLS = Object.freeze({
  time: async () => handleTools("current time"),
  weather: async () => handleTools("weather"),
  news: async () => handleTools("news"),
  crypto: async () => handleTools("bitcoin")
});

function isAgentModeRequest(text = "") {
  const value = String(text || "").trim();

  return (
    /^(agent|agent mode|run agent|use agent)\b/i.test(value) ||
    /^(briefing|research|analyze|analysis)\b/i.test(value) ||
    /^plan\b/i.test(value)
  );
}

function fallbackAgentToolPlan(goal) {
  const text = String(goal || "").toLowerCase();
  const plan = [];

  if (/time|clock|date|today/.test(text)) {
    plan.push("time");
  }

  if (/weather|temperature|rain|forecast/.test(text)) {
    plan.push("weather");
  }

  if (/news|headline/.test(text)) {
    plan.push("news");
  }

  if (/crypto|bitcoin|btc|ethereum/.test(text)) {
    plan.push("crypto");
  }

  return plan;
}

async function runAgent(goal) {
  add("J.A.R.V.I.S: Agent mode active.", "ai");

  const plan = fallbackAgentToolPlan(goal);

  if (!plan.length) {
    add("J.A.R.V.I.S: Analyzing your request...", "ai");
    return await askGemini(goal);
  }

  const results = {};

  for (const tool of plan) {
    add("J.A.R.V.I.S: Running " + tool + "...", "ai");

    try {
      results[tool] = await AGENT_TOOLS[tool]();
    } catch (error) {
      results[tool] = "Tool error: " + error.message;
    }
  }

  const summaryPrompt =
    "User goal: " + goal +
    "\nTool actions/results: " + JSON.stringify(results) +
    "\nExplain the results briefly and helpfully. " +
    "Do not claim you fetched live data if the tool only opened a website.";

  return await askGemini(summaryPrompt);
}

// ===================== 10. COMMAND PROCESSOR ===============

async function processMessage(text, imageData = null) {
  const command = String(text || "").trim();

  if (!command && !imageData) return;

  // Image request
  if (imageData) {
    const prompt = command ||
      "Analyze this image. Describe what you see and answer usefully.";
    return await askGemini(prompt, imageData);
  }

  // Tools
  const toolResult = await handleTools(command);

  if (toolResult) {
    add("J.A.R.V.I.S: " + toolResult, "ai");
    speak(toolResult);
    remember("user", command);
    remember("model", toolResult);
    return;
  }

  // Agent
  if (isAgentModeRequest(command)) {
    return await runAgent(command);
  }

  // Normal Gemini chat
  return await askGemini(command);
}

// ===================== 11. SEND BUTTON =====================

async function sendMessage() {
  const text = input.value.trim();

  if (!text) return;

  add("YOU: " + text, "user");

  input.value = "";

  sendBtn.disabled = true;

  try {
    await processMessage(text);
  } finally {
    sendBtn.disabled = false;
  }
}

sendBtn.onclick = sendMessage;

input.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    sendMessage();
  }
});

// ===================== 12. CAMERA ==========================

if (camBtn && imgInput) {
  camBtn.onclick = () => {
    imgInput.click();
  };

  imgInput.addEventListener("change", async () => {
    const file = imgInput.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      add("J.A.R.V.I.S: Please select an image.", "ai");
      imgInput.value = "";
      return;
    }

    add("YOU: [Image selected]", "user");
    add("J.A.R.V.I.S: Analyzing image...", "ai");

    try {
      const base64 = await fileToBase64(file);

      const imageData = {
        mimeType: file.type,
        base64: base64
      };

      const prompt =
        input.value.trim() ||
        "Describe this image and tell me what you can identify.";

      input.value = "";

      await processMessage(prompt, imageData);

    } catch (error) {
      add(
        "J.A.R.V.I.S: Image error - " + error.message,
        "ai"
      );
    }

    imgInput.value = "";
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");

      if (comma < 0) {
        reject(new Error("Could not read image."));
        return;
      }

      resolve(result.slice(comma + 1));
    };

    reader.onerror = () => reject(
      new Error("Image reading failed.")
    );

    reader.readAsDataURL(file);
  });
}

// ===================== 13. MICROPHONE ======================

const SpeechRecognition =
  window.SpeechRecognition ||
  window.webkitSpeechRecognition;

let rec = null;
let isListening = false;
let wakeMode = false;

if (SpeechRecognition) {
  rec = new SpeechRecognition();

  rec.lang = "en-IN";
  rec.continuous = false;
  rec.interimResults = false;

  rec.onstart = () => {
    isListening = true;

    if (micBtn) {
      micBtn.textContent = "LISTENING...";
    }
  };

  rec.onresult = async event => {
    const text = event.results?.[0]?.[0]?.transcript?.trim();

    if (!text) return;

    if (wakeMode) {
      if (/hey jarvis|hello jarvis|jarvis/i.test(text)) {
        wakeMode = false;

        if (wakeStatus) {
          wakeStatus.textContent = "WAKE: READY";
        }

        add("YOU: " + text, "user");

        const cleaned = text.replace(
          /hey jarvis|hello jarvis|jarvis/ig,
          ""
        ).trim();

        if (cleaned) {
          await processMessage(cleaned);
        } else {
          speak("Yes, Boss. I'm listening.");
        }
      }

      return;
    }

    add("YOU: " + text, "user");
    await processMessage(text);
  };

  rec.onerror = event => {
    console.error("Microphone error:", event.error);

    if (micBtn) {
      micBtn.textContent = "🎙️";
    }
  };

  rec.onend = () => {
    isListening = false;

    if (micBtn) {
      micBtn.textContent = "🎙️";
    }
  };

  if (micBtn) {
    micBtn.onclick = () => {
      try {
        if (isListening) {
          rec.stop();
          return;
        }

        rec.start();
      } catch (error) {
        console.warn("Recognition start error:", error);
      }
    };
  }

} else if (micBtn) {
  micBtn.onclick = () => {
    alert("Voice recognition is not supported in this browser.");
  };
}

// ===================== 14. WAKE MODE ======================

if (wakeBtn && rec) {
  wakeBtn.onclick = () => {
    wakeMode = !wakeMode;

    if (wakeStatus) {
      wakeStatus.textContent = wakeMode
        ? "WAKE: ON"
        : "WAKE: OFF";
    }

    if (wakeMode) {
      try {
        rec.start();
        speak("Wake mode activated.");
      } catch (error) {
        console.warn(error);
      }
    } else {
      try {
        rec.stop();
      } catch (error) {}

      speak("Wake mode disabled.");
    }
  };
}

// ===================== 15. TEXT TO SPEECH =================

let voices = [];

function loadVoices() {
  if ("speechSynthesis" in window) {
    voices = speechSynthesis.getVoices();
  }
}

if ("speechSynthesis" in window) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;

  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(
    String(text || "")
  );

  utterance.rate = 1.0;
  utterance.pitch = 0.85;
  utterance.volume = 1;

  const voice = voices.find(v =>
    /en-IN|en-US|en-GB/i.test(v.lang)
  );

  if (voice) {
    utterance.voice = voice;
  }

  speechSynthesis.speak(utterance);
}

// ===================== 16. CLEAR CHAT =====================

if (clearBtn) {
  clearBtn.onclick = () => {
    if (!confirm("Clear JARVIS conversation memory?")) {
      return;
    }

    MEMORY = [];
    localStorage.removeItem("jarvis_memory");

    if (chat) {
      chat.innerHTML = "";
    }

    add(
      "J.A.R.V.I.S: Memory cleared. Systems online.",
      "ai"
    );

    speak("Memory cleared, Boss.");
  };
}

// ===================== 17. STARTUP ========================

console.log("J.A.R.V.I.S SYSTEM ONLINE");

if (navigator.onLine) {
  console.log("Internet connection available.");
} else {
  console.log("No internet connection.");
}

window.addEventListener("online", () => {
  console.log("Internet connected.");
});

window.addEventListener("offline", () => {
  console.log("Internet disconnected.");
});
