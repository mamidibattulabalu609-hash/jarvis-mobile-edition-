
/* ==========================================
   J.A.R.V.I.S. AI ASSISTANT
   Gemini 3.8 Flash
   Streaming + Memory + Voice + Vision
========================================== */

// ===== 1. CONFIGURATION =====

const CONFIG = {
  MODEL: "gemini-3.8-flash",
  API_URL: "https://generativelanguage.googleapis.com/v1beta/models/",
  HISTORY_KEY: "jarvis_chat_history",
  KEY_NAME: "jarvis_key",
  MAX_HISTORY: 12
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

// ===== 4. MEMORY =====

let history = [];

try {
  history = JSON.parse(
    localStorage.getItem(CONFIG.HISTORY_KEY) || "[]"
  );

  if (!Array.isArray(history)) history = [];
} catch (error) {
  history = [];
}

let selectedImage = null;
let isBusy = false;

// ===== 5. CHAT DISPLAY =====

function addMessage(message, sender) {
  const div = document.createElement("div");

  div.className = sender;
  div.textContent = message;

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;

  return div;
}

// ===== 6. RESTORE CHAT =====

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
    const text = item.parts
      ?.map(part => part.text || "")
      .join("");

    if (!text) return;

    addMessage(
      (item.role === "user" ? "YOU: " : "J.A.R.V.I.S: ") + text,
      item.role === "user" ? "user" : "ai"
    );
  });
}

// ===== 7. SAVE MEMORY =====

function saveHistory() {
  history = history.slice(-CONFIG.MAX_HISTORY * 2);

  localStorage.setItem(
    CONFIG.HISTORY_KEY,
    JSON.stringify(history)
  );
}

// ===== 8. IMAGE UPLOAD =====

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
      addMessage("Please select an image file.", "ai");
      return;
    }

    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
          resolve(reader.result.split(",")[1]);
        };

        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      selectedImage = {
        data: base64,
        mimeType: file.type
      };

      addMessage("Image selected: " + file.name, "ai");

    } catch (error) {
      addMessage("Image upload failed.", "ai");
    }

    imgInput.value = "";
  });
}

// ===== 9. GEMINI STREAMING API =====

async function askGemini(question, image, onUpdate) {

  if (!API_KEY) {
    throw new Error("API key is missing.");
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
      parts: parts
    }
  ];

  const response = await fetch(
    `${CONFIG.API_URL}${CONFIG.MODEL}:streamGenerateContent?alt=sse&key=${API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: contents,
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 512
        }
      })
    }
  );

  if (!response.ok) {
    let errorMessage = "Gemini API request failed.";

    try {
      const errorData = await response.json();
      errorMessage =
        errorData.error?.message || errorMessage;
    } catch (error) {}

    throw new Error(errorMessage);
  }

  if (!response.body) {
    throw new Error("Streaming is not supported.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let answer = "";

  function processEvent(event) {
    const line = event
      .split(/\r?\n/)
      .find(line => line.startsWith("data:"));

    if (!line) return;

    const jsonText = line.slice(5).trim();

    if (!jsonText || jsonText === "[DONE]") return;

    const data = JSON.parse(jsonText);

    const chunk = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("") || "";

    if (chunk) {
      answer += chunk;
      onUpdate(answer);
    }

    if (data.error) {
      throw new Error(data.error.message || "Streaming error");
    }
  }

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

  if (!answer.trim()) {
    throw new Error("Gemini returned an empty response.");
  }

  history.push(
    {
      role: "user",
      parts: parts
    },
    {
      role: "model",
      parts: [{ text: answer }]
    }
  );

  saveHistory();

  return answer;
}

// ===== 10. VOICE OUTPUT =====

function speak(text) {
  if (!("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();

  const speech = new SpeechSynthesisUtterance(text);

  speech.lang = "en-IN";
  speech.rate = 1;
  speech.pitch = 1;

  window.speechSynthesis.speak(speech);
}

// ===== 11. SEND MESSAGE =====

async function sendMessage() {

  const question = input.value.trim();

  if ((!question && !selectedImage) || isBusy) return;

  if (!API_KEY) {
    addMessage("Please enter your Gemini API key.", "ai");
    return;
  }

  isBusy = true;

  if (sendBtn) sendBtn.disabled = true;

  addMessage(
    question || "Please analyse this image.",
    "user"
  );

  input.value = "";

  const image = selectedImage;
  selectedImage = null;

  const loading = addMessage(
    "J.A.R.V.I.S: Thinking...",
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

// ===== 12. SEND BUTTON =====

if (sendBtn) {
  sendBtn.addEventListener("click", sendMessage);
}

// ===== 13. ENTER KEY =====

if (input) {
  input.addEventListener("keydown", event => {

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }

  });
}

// ===== 14. VOICE INPUT =====

const SpeechRecognition =
  window.SpeechRecognition ||
  window.webkitSpeechRecognition;

let recognition = null;
let isListening = false;

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

    input.value =
      event.results[0][0].transcript;

    sendMessage();

  };

  recognition.onerror = event => {

    addMessage(
      "Voice error: " + event.error,
      "ai"
    );

  };

  recognition.onend = () => {

    isListening = false;

    if (micBtn) micBtn.textContent = "🎤";

  };
}

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
    } else {
      try {
        recognition.start();
      } catch (error) {
        console.error(error);
      }
    }

  });
}

// ===== 15. CLEAR CHAT =====

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

  });
}

// ===== 16. START JARVIS =====

restoreChat();

console.log("J.A.R.V.I.S ONLINE");
console.log("MODEL:", CONFIG.MODEL);


