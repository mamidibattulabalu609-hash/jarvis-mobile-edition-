
/* ==========================================
   J.A.R.V.I.S. AI ASSISTANT
   Gemini 3.8 Flash
   Fast Streaming + Auto Retry + Backup
   Chat + Image + Voice + Memory
========================================== */

// 1. CONFIGURATION

const CONFIG = {
  MODEL: "gemini-3.8-flash",
  FALLBACK_MODEL: "gemini-3.5-flash-lite",

  API_URL: "https://generativelanguage.googleapis.com/v1beta/models/",

  HISTORY_KEY: "jarvis_chat_history",
  KEY_NAME: "jarvis_key",

  MAX_HISTORY: 24,
  MAX_OUTPUT_TOKENS: 512,
  RETRIES: 2,
  TIMEOUT: 90000
};

// 2. API KEY

let API_KEY = localStorage.getItem(CONFIG.KEY_NAME);

if (!API_KEY) {
  API_KEY = prompt("Enter your Gemini API Key:");

  if (API_KEY) {
    API_KEY = API_KEY.trim();
    localStorage.setItem(CONFIG.KEY_NAME, API_KEY);
  }
}

// 3. HTML ELEMENTS

const chat = document.getElementById("chat");
const input = document.getElementById("msg");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic-btn");
const camBtn = document.getElementById("cam-btn");
const imgInput = document.getElementById("img-input");
const clearBtn = document.getElementById("clear-btn");

// 4. APP STATE

let history = [];
let selectedImage = null;
let isBusy = false;
let recognition = null;
let isListening = false;

// 5. LOAD MEMORY

try {
  const saved = JSON.parse(
    localStorage.getItem(CONFIG.HISTORY_KEY) || "[]"
  );

  if (Array.isArray(saved)) {
    history = saved.filter(item =>
      ["user", "model"].includes(item.role) &&
      Array.isArray(item.parts) &&
      item.parts.some(p => typeof p.text === "string")
    ).map(item => ({
      role: item.role,
      parts: item.parts
        .filter(p => typeof p.text === "string")
        .map(p => ({ text: p.text }))
    }));
  }
} catch (error) {
  history = [];
}

// 6. CHAT DISPLAY

function addMessage(message, sender) {
  const div = document.createElement("div");

  div.className = sender;
  div.textContent = message;

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;

  return div;
}

// 7. SAVE MEMORY

function saveHistory() {
  history = history.slice(-CONFIG.MAX_HISTORY);

  try {
    localStorage.setItem(
      CONFIG.HISTORY_KEY,
      JSON.stringify(history)
    );
  } catch (error) {
    console.error("Memory error:", error);
  }
}

// 8. RESTORE CHAT

function restoreChat() {
  chat.innerHTML = "";

  if (!history.length) {
    addMessage(
      "J.A.R.V.I.S: Systems online. How may I assist you?",
      "ai"
    );
    return;
  }

  history.forEach(item => {
    const message = item.parts
      .map(p => p.text || "")
      .join("");

    if (message) {
      addMessage(
        (item.role === "user" ? "YOU: " : "J.A.R.V.I.S: ") + message,
        item.role === "user" ? "user" : "ai"
      );
    }
  });
}

// 9. IMAGE UPLOAD

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
      addMessage("Image must be smaller than 10 MB.", "ai");
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
          new Error("Image reading failed.")
        );

        reader.readAsDataURL(file);
      });

      selectedImage = {
        data: base64,
        mimeType: file.type
      };

      addMessage("Image selected: " + file.name, "ai");

    } catch (error) {
      addMessage(error.message, "ai");
    }

    imgInput.value = "";
  });
}

// 10. WAIT

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 11. GEMINI CONNECTION

async function requestGemini(contents, signal) {

  const models = [
    CONFIG.MODEL,
    CONFIG.FALLBACK_MODEL
  ];

  let lastError = "Gemini connection failed.";

  for (const model of models) {

    for (let attempt = 0; attempt < CONFIG.RETRIES; attempt++) {

      try {

        const response = await fetch(
          `${CONFIG.API_URL}${model}:streamGenerateContent?alt=sse`,
          {
            method: "POST",

            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": API_KEY
            },

            signal,

            body: JSON.stringify({
              contents,

              generationConfig: {
                temperature: 0.5,
                maxOutputTokens: CONFIG.MAX_OUTPUT_TOKENS,

                thinkingConfig: {
                  thinkingLevel: "low"
                }
              }
            })
          }
        );

        if (response.ok) {
          return response;
        }

        const errorData = await response.json().catch(() => ({}));

        lastError =
          errorData.error?.message ||
          `HTTP Error ${response.status}`;

        // Retry temporary errors.

        const temporary =
          response.status === 429 ||
          response.status >= 500;

        // Try backup model if primary is not found.

        if (response.status === 404) {
          console.warn("Model not found:", model);
          break;
        }

        if (!temporary) {
          throw new Error(lastError);
        }

        if (attempt < CONFIG.RETRIES - 1) {
          await wait(1000 * (attempt + 1));
        }

      } catch (error) {

        if (signal.aborted) {
          throw new Error("Request timed out.");
        }

        if (
          error.message !== lastError &&
          !(error instanceof TypeError)
        ) {
          throw error;
        }

        lastError = "Network connection failed.";

        if (attempt < CONFIG.RETRIES - 1) {
          await wait(1000 * (attempt + 1));
        }
      }
    }

    console.warn("Trying backup model:", model);
  }

  throw new Error(lastError);
}

// 12. READ STREAMING RESPONSE

async function readGeminiStream(response, onUpdate) {

  if (!response.body) {
    throw new Error("Streaming is not supported.");
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
        throw new Error(data.error.message);
      }

      const chunk = (
        data.candidates?.[0]?.content?.parts || []
      )
        .map(part => part.text || "")
        .join("");

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

// 13. ASK GEMINI

async function askGemini(question, image, onUpdate, signal) {

  if (!API_KEY) {
    throw new Error("API key is missing.");
  }

  const parts = [{ text: question }];

  if (image) {
    parts.push({
      inlineData: {
        mimeType: image.mimeType,
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

  const response = await requestGemini(contents, signal);

  const answer = await readGeminiStream(
    response,
    onUpdate
  );

  // Save text only, not large image data.

  history.push(
    {
      role: "user",
      parts: [{ text: question }]
    },
    {
      role: "model",
      parts: [{ text: answer }]
    }
  );

  saveHistory();

  return answer;
}

// 14. VOICE OUTPUT

function speak(text) {

  if (!("speechSynthesis" in window)) {
    return;
  }

  window.speechSynthesis.cancel();

  const speech = new SpeechSynthesisUtterance(text);

  speech.lang = "en-IN";
  speech.rate = 1;
  speech.pitch = 1;

  window.speechSynthesis.speak(speech);
}

// 15. SEND MESSAGE

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

  const promptText = question || "Describe this image.";

  addMessage(
    question || "Image uploaded.",
    "user"
  );

  input.value = "";

  const loading = addMessage(
    "J.A.R.V.I.S: Connecting to Gemini...",
    "ai"
  );

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    CONFIG.TIMEOUT
  );

  try {

    const answer = await askGemini(
      promptText,
      image,

      text => {
        loading.textContent = "J.A.R.V.I.S: " + text;
        chat.scrollTop = chat.scrollHeight;
      },

      controller.signal
    );

    loading.textContent = "J.A.R.V.I.S: " + answer;

    speak(answer);

  } catch (error) {

    loading.textContent =
      "J.A.R.V.I.S Error: " + error.message;

    console.error("JARVIS ERROR:", error);

  } finally {

    clearTimeout(timeout);

    isBusy = false;

    if (sendBtn) sendBtn.disabled = false;

    input.focus();
  }
}

// 16. SEND BUTTON

if (sendBtn) {
  sendBtn.addEventListener("click", sendMessage);
}

// 17. ENTER KEY

if (input) {
  input.addEventListener("keydown", event => {

    if (event.key === "Enter" && !event.shiftKey) {

      event.preventDefault();
      sendMessage();
    }
  });
}

// 18. VOICE INPUT

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

// 19. MICROPHONE BUTTON

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

// 20. CLEAR MEMORY

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

// 21. START JARVIS

restoreChat();

console.log("J.A.R.V.I.S SYSTEM ONLINE");
console.log("PRIMARY MODEL:", CONFIG.MODEL);
console.log("BACKUP MODEL:", CONFIG.FALLBACK_MODEL);




