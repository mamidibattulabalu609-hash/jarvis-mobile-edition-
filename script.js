
const chat = document.getElementById("chat");
const input = document.getElementById("msg");
const send = document.getElementById("send");

send.addEventListener("click", sendMessage);

input.addEventListener("keydown", function(event) {
  if (event.key === "Enter") {
    sendMessage();
  }
});

function addMessage(text, type) {
  const message = document.createElement("div");

  message.className = "msg " + type;
  message.textContent = text;

  chat.appendChild(message);
  chat.scrollTop = chat.scrollHeight;

  return message;
}

function sendMessage() {
  const text = input.value.trim();

  if (text === "") return;

  addMessage("YOU: " + text, "user");

  input.value = "";
  send.disabled = true;

  const reply = addMessage(
    "J.A.R.V.I.S: Processing...",
    "ai"
  );

  setTimeout(function() {
    reply.textContent =
      "J.A.R.V.I.S: Systems online. How may I assist you, Boss?";

    send.disabled = false;
    input.focus();
    chat.scrollTop = chat.scrollHeight;

  }, 1000);
}
