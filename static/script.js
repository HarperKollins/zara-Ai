// Wait for the entire webpage to load before running our code
document.addEventListener("DOMContentLoaded", () => {
    
    // --- 1. Get references to our HTML elements ---
    const talkButton = document.getElementById("talkButton");
    const statusMessage = document.getElementById("statusMessage");
    const avatarContainer = document.querySelector(".avatar-container"); // Reference for animation

    // --- 2. Setup the Speech Recognition (Ears) ---
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.lang = 'en-US'; 
        recognition.interimResults = false; 
        recognition.continuous = false; 
    } else {
        statusMessage.textContent = "Sorry, your browser doesn't support speech recognition.";
        talkButton.disabled = true;
        return; 
    }

    // --- 3. Setup the Speech Synthesis (Voice) ---
    const synth = window.speechSynthesis;
    let voicesLoaded = false; // Flag to check if voices are loaded

    // --- 4. Define what happens when we get a speech result ---
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        statusMessage.textContent = `You said: "${transcript}"`;
        sendToBackend(transcript);
    };

    // Handle errors (like no speech detected)
    recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        statusMessage.textContent = "I didn't quite catch that. Try again.";
        // Ensure listening animations stop on error
        talkButton.classList.remove("listening");
        avatarContainer.classList.remove("listening");
    };

    // When listening stops, reset the button AND avatar
    recognition.onend = () => {
        talkButton.classList.remove("listening");
        avatarContainer.classList.remove("listening");
        // Don't reset status message here if we are about to speak
        if (!synth.speaking) {
             statusMessage.textContent = "Press the button and start speaking.";
        }
    };

    // --- 5. Define the main button click event ---
    talkButton.addEventListener("click", () => {
        // Stop any speaking that's in progress
        if (synth.speaking) {
            synth.cancel(); // This will trigger utterance.onend to reset state
        }
       
        // Don't start listening if already listening
        // (The 'listening' class is our state indicator now)
        if (talkButton.classList.contains("listening")) {
            recognition.stop(); // Allow manually stopping
            return;
        }

        // Start listening
        try {
            recognition.start();
            talkButton.classList.add("listening");
            avatarContainer.classList.add("listening");
            avatarContainer.classList.remove("speaking"); // Ensure speaking glow stops
            statusMessage.textContent = "Listening...";
        } catch (error) {
            console.error("Error starting recognition:", error);
            statusMessage.textContent = "Error starting. Please try again.";
            talkButton.classList.remove("listening"); // Reset button if start fails
            avatarContainer.classList.remove("listening");
        }
    });

    // --- 6. Function to send text to our Python backend ---
    async function sendToBackend(message) {
        statusMessage.textContent = "Thinking...";
        // Make sure listening animation stops visually
        talkButton.classList.remove("listening");
        avatarContainer.classList.remove("listening");
        
        try {
            const response = await fetch("/chat", { // Ensure HTTPS
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ message: message }),
            });

            if (!response.ok) {
                throw new Error(`Network response was not ok: ${response.statusText}`);
            }

            const data = await response.json();
            const botResponse = data.response;
            speak(botResponse);

        } catch (error) {
            console.error("Error sending message to backend:", error);
            statusMessage.textContent = "Error connecting to the brain. Is the server running?";
        }
    }

    // --- 7. Function to make the bot speak (Text-to-Speech) ---
    function speak(text) {
        const utterance = new SpeechSynthesisUtterance(text);
        
        // --- VOICE SELECTION LOGIC ---
        let voices = synth.getVoices();
        let femaleVoice = null;
        
        if (voices.length > 0) { // Only try selecting if voices are loaded
            femaleVoice = voices.find(voice => 
                voice.lang.startsWith('en') && 
                (voice.name.includes('Female') || voice.name.includes('Woman') || voice.name.includes('Zira') || voice.name.includes('Samantha'))
            );
        }

        if (femaleVoice) {
            utterance.voice = femaleVoice;
            console.log("Using voice:", femaleVoice.name); 
        } else {
            console.log("Female voice not found or voices not loaded yet, using default.");
        }
        // --- END OF VOICE SELECTION LOGIC ---

        // --- Event Handlers with Animation Classes ---
        utterance.onstart = () => {
            avatarContainer.classList.remove("listening"); // Stop listening animation
            avatarContainer.classList.add("speaking");    // Start speaking animation
            statusMessage.textContent = "Zara is speaking...";
        };
        utterance.onend = () => {
            avatarContainer.classList.remove("speaking"); // Stop speaking animation
            statusMessage.textContent = "Press the button and start speaking.";
        };
        utterance.onerror = (e) => {
            avatarContainer.classList.remove("speaking"); // Stop speaking animation on error
            console.error("Speech synthesis error:", e);
            statusMessage.textContent = "Error making me speak.";
        };
        // --- End of Event Handlers ---
        
        // Speak the text
        synth.speak(utterance);
    }

    // --- Load voices ---
    // Function to log voices once loaded
    function loadVoices() {
      let voices = synth.getVoices();
      if (voices.length > 0 && !voicesLoaded) {
          console.log("Available Voices:", voices.map(v => `${v.name} (${v.lang})`));
          voicesLoaded = true; 
      }
    }

    // Check immediately and set up listener
    loadVoices();
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = loadVoices;
    }
    // --- END OF VOICE LOADING ---

}); // <-- THIS is the final closing bracket/parenthesis for DOMContentLoaded