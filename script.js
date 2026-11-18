
let lastReply = "";

function speak(text) {

  if (!("speechSynthesis" in window)) {
    addMessage("Text-to-speech is not supported.", "bot");
    return;
  }

  window.speechSynthesis.cancel();

  const speech = new SpeechSynthesisUtterance(text);

  speech.lang = "en-IN";
  speech.rate = 0.9;
  speech.pitch = 1;
  speech.volume = 1;

  const voices = window.speechSynthesis.getVoices();

  const selectedVoice =
    voices.find(v => v.lang === "en-IN") ||
    voices.find(v => v.lang.startsWith("en")) ||
    null;

  if (selectedVoice) {
    speech.voice = selectedVoice;
  }

  speech.onstart = function() {
    document.getElementById("voiceStatus").textContent =
      "● SPEAKING";
  };

  speech.onend = function() {
    document.getElementById("voiceStatus").textContent =
      "● READY";
  };

  speech.onerror = function(event) {
    document.getElementById("voiceStatus").textContent =
      "● VOICE ERROR";

    console.log("Speech error:", event.error);
  };

  window.speechSynthesis.speak(speech);
}

function testVoice() {
  speak("Hello! I am Jarvis. Voice system is working.");
}
