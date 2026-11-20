
document.addEventListener("DOMContentLoaded", function () {

    const chat = document.getElementById("chat");
    const input = document.getElementById("msg");
    const sendBtn = document.getElementById("send");

    if (!chat || !input || !sendBtn) {
        alert("JARVIS ERROR: HTML elements not found!");
        return;
    }

    function addMessage(message, type) {
        const div = document.createElement("div");

        div.className = "msg " + type;
        div.textContent = message;

        chat.appendChild(div);
        chat.scrollTop = chat.scrollHeight;

        return div;
    }

    function sendMessage() {

        const text = input.value.trim();

        if (text === "") return;

        addMessage("YOU: " + text, "user");

        input.value = "";

        const reply = addMessage(
            "J.A.R.V.I.S: Processing...",
            "ai"
        );

        setTimeout(function () {
            reply.textContent =
                "J.A.R.V.I.S: Hello! Systems are online. How may I assist you, Boss?";
        }, 1000);
    }

    sendBtn.addEventListener("click", sendMessage);

    input.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
            sendMessage();
        }
    });

    addMessage(
        "J.A.R.V.I.S: System initialized. Ready for commands.",
        "ai"
    );

    console.log("JARVIS CHAT READY");

});
