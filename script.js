
/* ==========================================
   J.A.R.V.I.S AI ASSISTANT
   MOBILE EDITION
   CHAT SYSTEM
========================================== */

// HTML ELEMENTS
const chat = document.getElementById("chat");
const input = document.getElementById("msg");
const sendBtn = document.getElementById("send");

// PREVENT EMPTY MESSAGES
function addMessage(text, who) {

    const message = document.createElement("div");

    message.className = "msg " + who;
    message.textContent = text;

    chat.appendChild(message);

    // AUTO SCROLL
    chat.scrollTop = chat.scrollHeight;

    return message;
}

// SEND MESSAGE FUNCTION
function sendMessage() {

    const text = input.value.trim();

    if (!text) return;

    // USER MESSAGE
    addMessage("YOU: " + text, "user");

    // CLEAR INPUT
    input.value = "";

    // DISABLE BUTTON WHILE PROCESSING
    sendBtn.disabled = true;
    sendBtn.textContent = "WAIT";

    // AI LOADING MESSAGE
    const loading = addMessage(
        "J.A.R.V.I.S: Processing your command...",
        "ai"
    );

    // SIMULATED RESPONSE
    setTimeout(() => {

        loading.textContent =
            "J.A.R.V.I.S: Systems online. How may I assist you, Boss?";

        sendBtn.disabled = false;
        sendBtn.textContent = "SEND";

        input.focus();

    }, 1000);
}

// SEND BUTTON
sendBtn.addEventListener("click", sendMessage);

// ENTER KEY SUPPORT
input.addEventListener("keydown", function(event) {

    if (event.key === "Enter") {
        event.preventDefault();
        sendMessage();
    }

});

// INITIAL SYSTEM MESSAGE
console.log("J.A.R.V.I.S initialized successfully.");
