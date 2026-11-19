
/* ==========================================
   J.A.R.V.I.S. AI ASSISTANT
   Gemini 3.8 Flash
   Streaming + Auto Retry + Backup Model
   Chat + Image + Voice + Memory
========================================== */

// ===== 1. CONFIGURATION =====

const CONFIG = {
  MODEL: "gemini-3.8-flash",
  FALLBACK_MODEL: "gemini-3.5-flash-lite",
  API_URL: "https://generativelanguage.googleapis.com/v1beta/models/",
  HISTORY_KEY: "jarvis_chat_history",
  KEY_NAME: "jarvis_key",
  MAX_HISTORY: 12,
  MAX_OUTPUT_TOKENS: 512,
  RETRIES: 3
};

// ===== 2. API KEY =====

let API_KEY = localStorage.getItem(CONFIG.KEY_NAME);

if (!API_KEY) {
  API_KEY = prompt("Enter your Gemini API Key:");

  if (API_KEY) {
    API_KEY = API_KEY.trim();
    localStorage.setItem(CONFIG.KEY_NAME, API_KEY);
  }
}

// ===== 3. HTML ELEMENTS =====

const chat = document.getElementById("chat");
const input = document.getElementById("msg");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic-btn");
const camBtn = document.getElementById("cam-btn");
const imgInput = document.getElementById("img-input");
const clearBtn = document.getElementById("clear-btn");

// ===== 4. APP STATE =====

let history = [];
let selectedImage = null;
let isBusy = false;
let recognition = null;
let isListening = false;

// ===== 5. LOAD MEMORY =====

try {
  const saved = JSON.parse(
    localStorage.getItem(CONFIG.HISTORY_KEY) || "[]"
  );

  if (Array.isArray(saved)) {
    history = saved;
  }
} catch (error) {
  history = [];
}

// ===== 6. CHAT DISPLAY =====

function addMessage(message, sender) {
  const div = document.createElement("div");

  div.className = sender;
  div.textContent = message;

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;

  return div;
}

// ===== 7. SAVE MEMORY =====

function saveHistory() {
  history = history.slice(-CONFIG.MAX_HISTORY * 2);

  try {
    localStorage.setItem(
      CONFIG.HISTORY_KEY,
      JSON.stringify(history)
    );
  } catch (error) {
    console.error("Memory save error:", error);
  }
}

// ===== 8. RESTORE CHAT =====

function restoreChat() {
  chat.innerHTML = "";

  if (history.length === 0) {
    addMessage(
      "J.A.R.V.I.S: Systems online. How may I assist you?",
      "ai"
    );
    return;
  }

  history.forEach(item => {
    const text = (item.parts || [])
      .map(part => part.text || "")
      .join("");

    if (!text) return;

    addMessage(
      (item.role === "user" ? "YOU: " : "J.A.R.V.I.S: ") + text,
      item.role === "user" ? "user" : "ai"
    );
  });
}

// ===== 9. IMAGE UPLOAD =====

if (camBtn && imgInput) {
  camBtn.addEventListener("click", () => {
    imgInput.click();
  });
}

if (imgInput) {
  imgInput.addEventListener("change", async () => {
    const file = imgInput.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      addMessage("Please select a valid image.", "ai");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      addMessage("Please choose an image smaller than 10 MB.", "ai");
      imgInput.value = "";
      return;
    }

    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
          resolve(reader.result.split(",")[1]);
        };

        reader.onerror = () => reject(
          new Error("Could not read image.")
        );

        reader.readAsDataURL(file);
      });

      selectedImage = {
        data: base64,
        mimeType: file.type
      };

      addMessage("Image selected: " + file.name, "ai");

    } catch (error) {
      addMessage("Image upload failed: " + error.message, "ai");
    }

    imgInput.value = "";
  });
}

// ===== 10. WAIT FUNCTION =====

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== 11. REQUEST WITH AUTO RETRY =====

async function requestGemini(contents) {
  const models = [
    CONFIG.MODEL,
    CONFIG.FALLBACK_MODEL
  ];

  let lastError = "Gemini service is unavailable.";

  for (const model of models) {

    for (let attempt = 0; attempt < CONFIG.RETRIES; attempt++) {

      let response;

      try {
        response = await fetch(
          `${CONFIG.API_URL}${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(API_KEY)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              contents,
              generationConfig: {
                temperature: 0.5,
                maxOutputTokens: CONFIG.MAX_OUTPUT_TOKENS
              }
            })
          }
        );

      } catch (error) {
        lastError = "Network connection failed.";
        if (attempt < CONFIG.RETRIES - 1) {
          await wait(1500 * (2 ** attempt));
          continue;
        }
        break;
      }

      if (response.ok) {
        return response;
      }

      let errorData = {};

      try {
        errorData = await response.json();
      } catch (error) {}

      lastError =
        errorData.error?.message ||
        `Gemini API error: ${response.status}`;

      // Retry temporary server or rate-limit errors.
      const temporary =
        response.status === 429 ||
        response.status === 500 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504;

      if (!temporary) {
        throw new Error(lastError);
      }

      if (attempt < CONFIG.RETRIES - 1) {
        await wait(1500 * (2 ** attempt));
      }
    }

    console.warn("Model unavailable:", model);
  }

  throw new Error(lastError);
}

// ===== 12. READ STREAMING RESPONSE =====

async function readGeminiStream(response, onUpdate) {
  if (!response.body) {
    throw new Error("Streaming is not supported by this browser.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let answer = "";

  function processEvent(event) {
    const lines = event.split(/\r?\n/);

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;

      const jsonText = line.slice(5).trim();

      if (!jsonText || jsonText === "[DONE]") continue;

      const data = JSON.parse(jsonText);

      if (data.error) {
        throw new Error(
          data.error.message || "Gemini streaming error."
        );
      }

      const chunk = data.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("") || "";

      if (chunk) {
        answer += chunk;
        onUpdate(answer);
      }
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split(/\r?\n\r?\n/);

      buffer = events.pop() || "";

      for (const event of events) {
        processEvent(event);
      }
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
      processEvent(buffer);
    }

  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }

  if (!answer.trim()) {
    throw new Error("Gemini returned an empty response.");
  }

  return answer;
}

// ===== 13. ASK GEMINI =====

async function askGemini(question, image, onUpdate) {
  if (!API_KEY) {
    throw new Error("Gemini API key is missing.");
  }

  const parts = [{ text: question }];

  if (image) {
    parts.push({
      inline_data: {
        mime_type: image.mimeType,
        data: image.data
      }
    });
  }

  const contents = [
    ...history,
    {
      role: "user",
      parts
    }
  ];

  const response = await requestGemini(contents);

  const answer = await readGeminiStream(
    response,
    onUpdate
  );

  history.push(
    {
      role: "user",
      parts
    },
    {
      role: "model",
      parts: [{ text: answer }]
    }
  );

  saveHistory();

  return answer;
}

// ===== 14. VOICE OUTPUT =====

function speak(text) {
  if (!("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();

  const speech = new SpeechSynthesisUtterance(text);

  speech.lang = "en-IN";
  speech.rate = 1;
  speech.pitch = 1;

  window.speechSynthesis.speak(speech);
}

// ===== 15. SEND MESSAGE =====

async function sendMessage() {
  const question = input.value.trim();

  if ((!question && !selectedImage) || isBusy) return;

  if (!API_KEY) {
    addMessage("Please enter your Gemini API key.", "ai");
    return;
  }

  isBusy = true;

  if (sendBtn) sendBtn.disabled = true;

  const image = selectedImage;
  selectedImage = null;

  addMessage(
    question || "Please analyse this image.",
    "user"
  );

  input.value = "";

  const loading = addMessage(
    "J.A.R.V.I.S: Connecting to Gemini...",
    "ai"
  );

  try {
    const answer = await askGemini(
      question || "Describe this image.",
      image,
      text => {
        loading.textContent = "J.A.R.V.I.S: " + text;
        chat.scrollTop = chat.scrollHeight;
      }
    );

    loading.textContent = "J.A.R.V.I.S: " + answer;

    speak(answer);

  } catch (error) {
    loading.textContent =
      "J.A.R.V.I.S Error: " + error.message;

    console.error("JARVIS ERROR:", error);

  } finally {
    isBusy = false;

    if (sendBtn) sendBtn.disabled = false;

    input.focus();
  }
}

// ===== 16. SEND BUTTON =====

if (sendBtn) {
  sendBtn.addEventListener("click", sendMessage);
}

// ===== 17. ENTER KEY =====

if (input) {
  input.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
}

// ===== 18. VOICE INPUT =====

const SpeechRecognition =
  window.SpeechRecognition ||
  window.webkitSpeechRecognition;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();

  recognition.lang = "en-IN";
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    isListening = true;

    if (micBtn) micBtn.textContent = "🔴";
  };

  recognition.onresult = event => {
    const spokenText =
      event.results[0][0].transcript;

    input.value = spokenText;
    sendMessage();
  };

  recognition.onerror = event => {
    addMessage(
      "Voice input error: " + event.error,
      "ai"
    );
  };

  recognition.onend = () => {
    isListening = false;

    if (micBtn) micBtn.textContent = "🎤";
  };
}

// ===== 19. MICROPHONE BUTTON =====

if (micBtn) {
  micBtn.addEventListener("click", () => {
    if (!recognition) {
      addMessage(
        "Voice recognition is not supported in this browser.",
        "ai"
      );
      return;
    }

    if (isListening) {
      recognition.stop();
      return;
    }

    try {
      recognition.start();
    } catch (error) {
      console.error("Microphone error:", error);
    }
  });
}

// ===== 20. CLEAR MEMORY =====

if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    history = [];

    localStorage.removeItem(CONFIG.HISTORY_KEY);

    chat.innerHTML = "";

    addMessage(
      "J.A.R.V.I.S: Memory cleared. Systems ready.",
      "ai"
    );

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    if (isListening && recognition) {
      recognition.stop();
    }
  });
}

// ===== 21. START JARVIS =====

restoreChat();

console.log("J.A.R.V.I.S SYSTEM ONLINE");
console.log("PRIMARY MODEL:", CONFIG.MODEL);
console.log("BACKUP MODEL:", CONFIG.FALLBACK_MODEL);



