// Wrap everything
document.addEventListener("DOMContentLoaded", () => {
    console.log(">>> SCRIPT START (Browser Speech + Vision - Full)");

    // --- 1. Get references ---
    const talkButton = document.getElementById("talkButton");
    const cameraButton = document.getElementById("cameraButton");
    const statusMessage = document.getElementById("statusMessage");
    const avatarContainer = document.getElementById("avatarContainer");
    const avatarImage = document.getElementById("avatarImage");
    const videoElement = document.querySelector('.input_video');
    console.log(">>> Got element references");

    // --- Check elements ---
    if (!talkButton || !cameraButton || !statusMessage || !avatarContainer || !videoElement) {
        console.error(">>> CRITICAL ERROR: Essential elements missing!");
        if(statusMessage) statusMessage.textContent = "Error: UI component missing.";
        return; // Stop script execution if critical elements are missing
    }

    // --- 2. Speech Recognition (Input) ---
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;
    if (!SpeechRecognition) {
        console.error(">>> Speech Recognition not supported.");
        statusMessage.textContent = "Browser doesn't support speech recognition.";
        talkButton.disabled = true;
        cameraButton.disabled = true;
        return;
    }
    try {
        recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.continuous = false;
        console.log(">>> Speech Recognition initialized.");
    } catch (e) {
        console.error(">>> Error initializing Speech Recognition:", e);
        statusMessage.textContent = "Error initializing speech recognition.";
        talkButton.disabled = true;
        cameraButton.disabled = true;
        return;
    }

    // --- 3. Speech Synthesis (Output - Browser Built-in) ---
    const synth = window.speechSynthesis;
    let voices = [];
    let selectedVoice = null;
    let utterance = null;
    let isSpeaking = false; // Flag for browser speech

    function loadVoices() {
      voices = synth.getVoices();
      if (voices.length > 0) {
          console.log("Available Voices:", voices.map(v => `${v.name} (${v.lang})`));
          selectedVoice = voices.find(voice =>
                voice.lang.startsWith('en') &&
                (voice.name.includes('Female') || voice.name.includes('Woman') || voice.name.includes('Zira') || voice.name.includes('Samantha') || voice.default)
            );
          if (selectedVoice) { console.log("Selected default voice:", selectedVoice.name); }
          else { console.warn("Could not find a preferred female English voice."); }
      } else { console.warn("Browser voices not loaded yet."); }
    }
    loadVoices();
    if (synth.onvoiceschanged !== undefined) { synth.onvoiceschanged = loadVoices; }

    // --- 4. MediaPipe Setup (Vision) ---
    let faceMesh; let hands; let camera; let visionActive = false;
    let currentVisualContext = { isSmiling: false, fingersUp: 0 }; // Store visual state

    // --- onFaceResults (Handles Face Mesh Data) ---
    function onFaceResults(results) {
        let smilingDetected = false;
        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            const landmarks = results.multiFaceLandmarks[0];
            const upperLipCenter = landmarks[13]; const lowerLipCenter = landmarks[14];
            const leftCorner = landmarks[61]; const rightCorner = landmarks[291];
            if (upperLipCenter && lowerLipCenter && leftCorner && rightCorner) {
                 const mouthWidth = Math.hypot(leftCorner.x - rightCorner.x, leftCorner.y - rightCorner.y);
                 const mouthHeight = Math.hypot(upperLipCenter.x - lowerLipCenter.x, upperLipCenter.y - lowerLipCenter.y);
                 const smileRatio = mouthWidth / mouthHeight;
                 if (smileRatio > 4.5) { smilingDetected = true; }
            }
        }
        if (currentVisualContext.isSmiling !== smilingDetected) {
            console.log("Smile state changed:", smilingDetected);
            currentVisualContext.isSmiling = smilingDetected;
            // TODO: Add visual feedback for smile if desired
            // if (smilingDetected) avatarContainer.classList.add("smiling"); else avatarContainer.classList.remove("smiling");
        }
    }

    // --- onHandResults (Handles Hand Tracking Data) ---
    function onHandResults(results) {
        let currentFingers = 0;
        if (results.multiHandLandmarks && results.multiHandedness) {
            if (results.multiHandLandmarks.length > 0) {
                const landmarks = results.multiHandLandmarks[0]; // Process first hand
                const tipIds = [4, 8, 12, 16, 20];
                let fingersUpCount = 0;
                 if (landmarks[tipIds[0]].y < landmarks[tipIds[0] - 2].y) { fingersUpCount++; } // Basic Thumb check
                 for (let j = 1; j < 5; j++) { if (landmarks[tipIds[j]].y < landmarks[tipIds[j] - 2].y) { fingersUpCount++; } }
                 currentFingers = fingersUpCount;
            }
        }
        if (currentVisualContext.fingersUp !== currentFingers) {
             console.log("Fingers up changed:", currentFingers);
             currentVisualContext.fingersUp = currentFingers;
        }
    }

    // --- initializeVision (Sets up and starts camera/MediaPipe) ---
    function initializeVision() {
        console.log(">>> initializeVision() called.");
        if (visionActive) { console.log("Vision already active."); return; }

        statusMessage.textContent = "Initializing camera...";
        cameraButton.disabled = true; cameraButton.textContent = "Starting...";

        try {
            // Check if MediaPipe objects exist
            if (typeof FaceMesh === "undefined" || typeof Hands === "undefined" || typeof Camera === "undefined") {
                 console.error("MediaPipe libraries not loaded!");
                 throw new Error("MediaPipe libraries not loaded.");
            }

            faceMesh = new FaceMesh({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`});
            faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
            faceMesh.onResults(onFaceResults);
            console.log(">>> FaceMesh configured.");

            hands = new Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
            hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
            hands.onResults(onHandResults);
            console.log(">>> Hands configured.");

            if (!videoElement) { throw new Error("Video element missing"); }
            camera = new Camera(videoElement, {
                onFrame: async () => {
                     if (!visionActive || !faceMesh || !hands || !videoElement) return;
                     // Ensure video is playing and has data
                     if (videoElement.paused || videoElement.ended || videoElement.readyState < 2) return;
                     try {
                         await faceMesh.send({image: videoElement});
                         await hands.send({image: videoElement});
                     } catch (error) { console.error("Error processing MediaPipe frame:", error); }
                 }, width: 640, height: 360
            });
            console.log(">>> Camera configured.");

            // Use navigator.mediaDevices directly for permissions check
            navigator.mediaDevices.getUserMedia({ video: true, audio: false })
                .then((stream) => {
                    console.log(">>> Camera permission granted.");
                    videoElement.srcObject = stream; // Assign stream to video element
                    videoElement.play(); // Start playing the video element (needed for Camera util)

                    // Now start the MediaPipe camera utility
                    camera.start()
                        .then(() => {
                            console.log(">>> MediaPipe Camera started successfully.");
                            visionActive = true;
                            statusMessage.textContent = "Tap Mic to start speaking.";
                            talkButton.disabled = false; // <<< ENABLE MIC
                            cameraButton.textContent = "Vision Active";
                            cameraButton.classList.add("active");
                            cameraButton.disabled = false;
                        })
                        .catch(camUtilError => { // Catch errors from camera.start()
                             console.error(">>> MediaPipe Camera util start failed:", camUtilError);
                             statusMessage.textContent = "Error starting vision processing.";
                             visionActive = false; cameraButton.textContent = "Activate Vision"; cameraButton.disabled = false; talkButton.disabled = true;
                             stream.getTracks().forEach(track => track.stop()); // Stop the stream if util fails
                        });
                })
                .catch(err => { // Catch errors from getUserMedia (permissions etc.)
                    console.error(">>> getUserMedia failed:", err);
                    statusMessage.textContent = "Could not access camera. Check permissions.";
                    visionActive = false; cameraButton.textContent = "Activate Vision"; cameraButton.disabled = false; talkButton.disabled = true;
                });

        } catch(error) {
             console.error(">>> Error during Vision setup:", error);
             statusMessage.textContent = "Error setting up vision components.";
             cameraButton.textContent = "Activate Vision"; cameraButton.disabled = false; talkButton.disabled = true;
        }
    }
    // --- End MediaPipe Setup ---


    // --- 5. Event Handlers ---

    // Speech Recognition Handlers
    recognition.onresult = (event) => {
        console.log(">>> recognition.onresult FIRED.");
        if (event.results && event.results.length > 0 && event.results[0].length > 0 && event.results[0][0].transcript) {
            const transcript = event.results[0][0].transcript;
            console.log(">>> Transcript received:", transcript);
            if (statusMessage) statusMessage.textContent = `You said: "${transcript}"`;
            console.log(">>> Attempting to call sendToBackend...");
            sendToBackend(transcript, currentVisualContext); // Pass context
            console.log(">>> Successfully CALLED sendToBackend.");
        } else { console.warn(">>> recognition.onresult: no valid transcript found:", event); }
    };
    recognition.onerror = (event) => { console.error("Speech recognition error:", event.error); statusMessage.textContent = `Mic Error: ${event.error}`; talkButton.classList.remove("listening"); avatarContainer.classList.remove("listening"); };
    recognition.onend = () => { console.log("Recognition ended."); if (!isSpeaking) { statusMessage.textContent = "Tap Mic to start speaking."; } talkButton.classList.remove("listening"); avatarContainer.classList.remove("listening"); };

    // Speech Synthesis (Browser) Handlers & Functions
    function speak(text) { if (synth.speaking) { console.warn("Synth speaking, cancelling."); synth.cancel(); setTimeout(() => { startSpeaking(text); }, 100); } else { startSpeaking(text); } }
    function startSpeaking(text){
        if(!text) { console.error("speak function called with empty text."); return; }
        utterance = new SpeechSynthesisUtterance(text);
        if (selectedVoice) { utterance.voice = selectedVoice; } else { loadVoices(); if (selectedVoice) utterance.voice = selectedVoice; else console.log("Speaking with browser default."); }
        utterance.onstart = () => { console.log("SpeechSynthesis started."); isSpeaking = true; avatarContainer.classList.remove("listening"); avatarContainer.classList.add("speaking"); statusMessage.textContent = "Zara is speaking..."; };
        utterance.onend = () => { console.log("SpeechSynthesis ended."); isSpeaking = false; avatarContainer.classList.remove("speaking"); if (!talkButton.classList.contains("listening")) { statusMessage.textContent = "Tap Mic to start speaking."; } utterance = null; };
        utterance.onerror = (e) => { console.error("SpeechSynthesis error:", e); isSpeaking = false; avatarContainer.classList.remove("speaking"); statusMessage.textContent = "Error making me speak."; utterance = null; };
        synth.speak(utterance);
    }


    // --- 6. BUTTON Click Listeners ---
    if (cameraButton) {
        cameraButton.addEventListener("click", () => {
            console.log(">>> Camera button clicked.");
            if (!visionActive) {
                initializeVision(); // Call the function to start camera and MediaPipe
            } else {
                console.log("Vision is already active.");
                // Optional: Implement stopVision() if needed
            }
        });
        console.log(">>> Camera button listener attached.");
    } else { console.error(">>> Camera button element not found!"); }

    if (talkButton) {
        talkButton.addEventListener("click", () => {
            console.log(">>> Talk button clicked. State:", { isDisabled: talkButton.disabled, isSynthSpeaking: synth.speaking, isListening: talkButton.classList.contains("listening") });
            if (talkButton.disabled) { console.log("Talk button disabled."); return; }
            if (!recognition) { console.error("Recognition not ready!"); return; }

            // Stop synth speech if speaking
            if (synth.speaking) { console.log("Talk Button: Stopping SpeechSynthesis"); synth.cancel(); isSpeaking = false; avatarContainer.classList.remove("speaking"); statusMessage.textContent = "Tap Mic to start speaking."; return; }

            // Stop listening if listening
            if (talkButton.classList.contains("listening")) { console.log("Talk Button: Stopping listening"); recognition.stop(); return; }

            // Start listening
            console.log("Talk Button: Attempting to start recognition...");
            try { recognition.start(); talkButton.classList.add("listening"); avatarContainer.classList.add("listening"); avatarContainer.classList.remove("speaking"); statusMessage.textContent = "Listening..."; console.log("Recognition started via button click."); } catch (error) { console.error(">>> Error starting recognition via button:", error); statusMessage.textContent = "Error starting mic."; talkButton.classList.remove("listening"); avatarContainer.classList.remove("listening"); }
        });
        console.log(">>> Talk button listener attached.");
    } else { console.error(">>> Talk button element not found!"); }


    // --- 7. Fetch TEXT Response from Backend ---
    async function sendToBackend(message, visualContext) {
        console.log(">>> sendToBackend STARTING (Browser Speech). Message:", message, "Context:", visualContext);
        statusMessage.textContent = "Thinking...";
        avatarContainer.classList.remove("listening");
        talkButton.classList.remove("listening");

        currentFetchAbortController = new AbortController();
        const signal = currentFetchAbortController.signal;

        try {
            console.log(">>> Preparing to fetch /chat (expecting JSON)...");
            const response = await fetch("/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: message, visualContext: visualContext }), signal: signal });
            console.log(`>>> Fetch response status: ${response.status}`);
            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) { const responseText = await response.text(); console.error(">>> Server did not send JSON. Response text:", responseText); throw new Error(`Server error: ${response.status} (Non-JSON response)`); }
             const data = await response.json();
            if (!response.ok) { const errorMsg = data.error || `Server error: ${response.status}`; console.error(">>> Fetch failed:", errorMsg); throw new Error(errorMsg); }
            if (data.response) { const botResponseText = data.response; console.log(">>> Received text response:", botResponseText); speak(botResponseText); }
            else { console.error(">>> JSON response missing 'response' field:", data); throw new Error("Received invalid response from server."); }
        } catch (error) {
             if (error.name === 'AbortError') { console.log(">>> Fetch aborted by user."); statusMessage.textContent = "Stopped."; }
             else { console.error(">>> Error fetching or processing response:", error); statusMessage.textContent = error.message || "Error connecting to the brain."; }
              isSpeaking = false; avatarContainer.classList.remove("speaking");
        } finally {
            currentFetchAbortController = null;
             console.log(">>> Fetch process ended (finally block).");
        }
    }

    // --- 8. Initial Status ---
    statusMessage.textContent = "Activate Vision to enable interaction.";
    talkButton.disabled = true;
    console.log(">>> Script initialization finished.");

}); // <-- End of DOMContentLoaded