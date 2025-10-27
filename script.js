// Modern chat behavior
window.addEventListener('DOMContentLoaded', () => {
	const form = document.getElementById('chat-form');
	const input = document.getElementById('user-input');
	const messages = document.getElementById('messages');
	const sendBtn = document.getElementById('send-btn');
	const clearBtn = document.getElementById('clear-chat');
	const MODEL = 'gpt-5-nano';
			// Optional: Set a persona/system-style instruction to steer the AI's tone/behavior.
			// Edit this string to change how the assistant talks.
			const PERSONA = `
		You are Nova, a calm and competent AI assistant.
		Style: friendly, modern, and succinct—no fluff.
		When answering:
		- Be concise and helpful; prefer short sentences and bullet points.
		- Provide concrete steps or examples only when they add value.
		- If the request is ambiguous, ask one brief clarifying question first.
		- If you don't know, say so and suggest a next step.
		- Do not repeat the user's question.
		`;

	// Utilities
	const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	const scrollToBottom = () => { messages.scrollTop = messages.scrollHeight; };

	function createMessageEl({ text = '', role = 'ai', isTyping = false } = {}) {
		const wrap = document.createElement('div');
		wrap.className = `msg ${role === 'user' ? 'msg--user' : 'msg--ai'}`;

		const avatar = document.createElement('div');
		avatar.className = 'msg__avatar';
		avatar.textContent = role === 'user' ? '🧑' : '🤖';

		const content = document.createElement('div');

		const bubble = document.createElement('div');
		bubble.className = 'msg__bubble';

		if (isTyping) {
			const typing = document.createElement('div');
			typing.className = 'typing';
			typing.innerHTML = '<span class="typing__dot"></span><span class="typing__dot"></span><span class="typing__dot"></span>';
			bubble.appendChild(typing);
		} else {
			bubble.textContent = text;
		}

		const meta = document.createElement('div');
		meta.className = 'msg__meta';
		meta.textContent = now();

		content.appendChild(bubble);
		content.appendChild(meta);
		wrap.appendChild(avatar);
		wrap.appendChild(content);
		return wrap;
	}

	function addUserMessage(text) {
		const el = createMessageEl({ text, role: 'user' });
		messages.appendChild(el);
		scrollToBottom();
		return el;
	}

	function addTyping() {
		const el = createMessageEl({ isTyping: true, role: 'ai' });
		messages.appendChild(el);
		scrollToBottom();
		return el;
	}

	function replaceTypingWith(text, typingEl) {
		if (!typingEl) return;
		const bubble = typingEl.querySelector('.msg__bubble');
		if (bubble) {
			bubble.textContent = text;
		}
		typingEl.querySelector('.msg__meta').textContent = now();
		scrollToBottom();
	}

	// Auto-resize textarea
	function autosize() {
		input.style.height = 'auto';
		input.style.height = Math.min(input.scrollHeight, 160) + 'px';
	}
	input.addEventListener('input', autosize);
	setTimeout(autosize, 0);

	// Enter to send (Shift+Enter = newline)
	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			form.requestSubmit();
		}
	});

	// Clear chat
	clearBtn?.addEventListener('click', () => {
		messages.innerHTML = '';
		input.focus();
	});

	// Submit handler
	form.addEventListener('submit', async (e) => {
		e.preventDefault();
		const userMsg = input.value.trim();
		if (!userMsg) return;

		addUserMessage(userMsg);
		input.value = '';
		autosize();

		sendBtn.disabled = true;
		input.disabled = true;

		const typingEl = addTyping();

			try {
				// Compose prompt with optional persona prefix
				const prompt = PERSONA
					? `${PERSONA}\n\nUser: ${userMsg}`
					: userMsg;
				// Call Puter AI
				const response = await puter.ai.chat(prompt, { model: MODEL });
			replaceTypingWith(response, typingEl);
		} catch (err) {
			const msg = err?.message || 'Unexpected error';
			replaceTypingWith('Error: ' + msg, typingEl);
		} finally {
			sendBtn.disabled = false;
			input.disabled = false;
			input.focus();
		}
	});
});
