/* =====================================
   J.A.R.V.I.S MOBILE EDITION
   CHAT ENGINE
===================================== */

// GET HTML ELEMENTS
const chat = document.getElementById("chat");
const input = document.getElementById("msg");
const sendBtn = document.getElementById("send");

// CHECK REQUIRED ELEMENTS
if (!chat || !input || !sendBtn) {
    console.error("J.A.R.V.I.S: Required HTML elements not found.");
} else {

    // SEND BUTTON
    sendBtn.addEventListener("click", sendMessage);

    // ENTER KEY
    input.addEventListener("keydown", function(event) {
        if (event.key === "Enter") {
            sendMessage();
        }
    });

    // SEND MESSAGE FUNCTION
    function sendMessage() {

        const text = input.value.trim();

        if (!text) return;

        // DISPLAY USER MESSAGE
        addMessage("YOU: " + text, "user");

        // CLEAR INPUT
        input.value = "";

        // CREATE AI PROCESSING MESSAGE
        const aiMessage = addMessage(
            "J.A.R.V.I.S: Processing...",
            "ai"
        );

        // SIMULATE AI RESPONSE
        setTimeout(() => {

            aiMessage.innerText =
                "J.A.R.V.I.S: Systems online. How may I assist you, Boss?";

            chat.scrollTop = chat.scrollHeight;

        }, 1000);
    }

    // ADD MESSAGE FUNCTION
    function addMessage(text, who) {

        const message = document.createElement("div");

        message.className = "msg " + who;
        message.textContent = text;

        chat.appendChild(message);

        // AUTO SCROLL
        chat.scrollTop = chat.scrollHeight;

        return message;
    }

    console.log("J.A.R.V.I.S Chat Engine: ONLINE");
}
