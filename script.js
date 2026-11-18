
const chat = document.getElementById('chat');
const input = document.getElementById('msg');
const send = document.getElementById('send');

// Send button
send.addEventListener('click', sendMessage);

// Enter key support
input.addEventListener('keydown', function(event) {
  if (event.key === 'Enter') {
    sendMessage();
  }
});

function sendMessage() {
  const text = input.value.trim();

  if (!text) return;

  // Display user message
  addMessage('YOU: ' + text, 'user');

  input.value = '';

  // Display AI processing message
  const reply = addMessage(
    'J.A.R.V.I.S: Processing...',
    'ai'
  );

  send.disabled = true;

  // Demo response (not connected to real AI)
  setTimeout(function() {
    reply.textContent =
      'J.A.R.V.I.S: Systems online. How may I assist you, Boss?';

    send.disabled = false;
    input.focus();
  }, 1000);
}

// Add messages to chat
function addMessage(text, who) {
  const div = document.createElement('div');

  div.className = 'msg ' + who;
  div.textContent = text;

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;

  return div;
}
