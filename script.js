
// ===== J.A.R.V.I.S VOICE + AI =====

const chat = document.getElementById("chat");
const input = document.getElementById("msg");
const micBtn = document.getElementById("voiceBtn");
const sendBtn = document.getElementById("send");
const stopBtn = document.getElementById("stopVoice");
const voiceInfo = document.getElementById("voiceInfo");

// ===== CHAT DISPLAY =====

function add(text, who) {
  const d = document.createElement("div");
  d.className = "msg " + who;
  d.textContent = text;

  chat.appendChild(d);
  chat.scrollTop = chat.scrollHeight;

  return d;
}

// ===== GEMINI BACKEND CONNECTION =====

async function askGemini(prompt) {
  const loading = add("J.A.R.V.I.S: Thinking...", "ai");

  sendBtn.disabled = true;

  try {
    // Backend must securely call Gemini API
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: prompt
      })
    });

    if (!response.ok) {
      throw new Error("AI server error: " + response.status);
    }

    const data = await response.json();

    if (!data.reply) {
      throw new Error("Empty AI response");
    }

    loading.textContent = "J.A.R.V.I.S: " + data.reply;

    speak(data.reply);

  } catch (error) {
    loading.textContent =
      "J.A.R.V.I.S: " + error.message;

  } finally {
    sendBtn.disabled = false;
  }
}

// ===== TEXT MESSAGE =====

function sendMessage() {
  const text = input.value.trim();

  if (!text) return;

  add("YOU: " + text, "user");

  input.value = "";

  askGemini(text);
}

sendBtn.addEventListener("click", sendMessage);

input.addEventListener("keydown", function(event) {
  if (event.key === "Enter") {
    sendMessage();
  }
});

// ===== SPEECH RECOGNITION =====

const SR =
  window.SpeechRecognition ||
  window.webkitSpeechRecognition;

let recognition = null;

if (SR) {
  recognition = new SR();

  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = function() {
    micBtn.textContent = "LISTENING...";
    voiceInfo.textContent = "J.A.R.V.I.S is listening...";
  };

  recognition.onresult = function(event) {
    const text = event.results[0][0].transcript;

    add("YOU: " + text, "user");

    askGemini(text);
  };

  recognition.onerror = function(event) {
    voiceInfo.textContent =
      "Voice error: " + event.error;
  };

  recognition.onend = function() {
    micBtn.textContent = "🎤 SPEAK";
    voiceInfo.textContent =
      "Press SPEAK to talk to J.A.R.V.I.S";
  };

  micBtn.addEventListener("click", function() {
    try {
      recognition.start();
    } catch (error) {
      voiceInfo.textContent =
        "Microphone is already active.";
    }
  });

  stopBtn.addEventListener("click", function() {
    recognition.stop();
    speechSynthesis.cancel();
  });

} else {
  micBtn.disabled = true;
  voiceInfo.textContent =
    "Speech recognition is not supported in this browser.";
}

// ===== TEXT TO SPEECH =====

let voices = [];

function loadVoices() {
  voices = speechSynthesis.getVoices();
}

loadVoices();

speechSynthesis.onvoiceschanged = loadVoices;

function speak(text) {
  speechSynthesis.cancel();

  const utterance =
    new SpeechSynthesisUtterance(text);

  utterance.rate = 1.05;
  utterance.pitch = 0.85;

  const voice = voices.find(v =>
    v.lang.startsWith("en")
  );

  if (voice) {
    utterance.voice = voice;
  }

  speechSynthesis.speak(utterance);
}
