document.addEventListener("DOMContentLoaded", () => {
    
    // --- Get HTML elements ---
    const talkButton = document.getElementById("talkButton");
    const statusMessage = document.getElementById("statusMessage");
    const avatarContainer = document.querySelector(".avatar-container");

    // --- Speech Recognition (Input) ---
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;
    if (!SpeechRecognition) {
        statusMessage.textContent = "Browser doesn't support speech recognition.";
        talkButton.disabled = true;
        return;
    }
    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;

    // --- Audio Playback (Output) ---
    let audioContext; // Use AudioContext for better control
    let sourceNode;
    let mediaSource;
    let sourceBuffer;
    let audioQueue = [];
    let isPlaying = false;
    let isAppending = false; // Flag to prevent concurrent appends
    let streamEnded = false;
    let currentFetchAbortController = null; // To cancel fetch if needed

    function setupMediaSource() {
        if (!window.MediaSource) {
            console.error("MediaSource API not supported!");
            statusMessage.textContent = "Browser cannot play streamed audio.";
            return false;
        }
        mediaSource = new MediaSource();
        const audioURL = URL.createObjectURL(mediaSource);
        audio = new Audio(); // Use a standard Audio element
        audio.src = audioURL;
        audioQueue = [];
        isPlaying = false;
        isAppending = false;
        streamEnded = false;

        mediaSource.addEventListener('sourceopen', handleSourceOpen);
        audio.onplay = handleAudioPlay;
        audio.onended = handleAudioEnded;
        audio.onerror = handleAudioError;
        return true;
    }

    function handleSourceOpen() {
        console.log("MediaSource opened");
        if (!mediaSource) return; // Guard against race conditions
        try {
            // Use a specific codec string if possible, otherwise rely on browser detection
            const mimeCodec = 'audio/mpeg'; 
            if (MediaSource.isTypeSupported(mimeCodec)) {
                 sourceBuffer = mediaSource.addSourceBuffer(mimeCodec);
                 sourceBuffer.mode = 'sequence'; // Important for streaming
                 sourceBuffer.addEventListener('updateend', handleBufferUpdateEnd);
                 sourceBuffer.addEventListener('error', (e) => console.error("SourceBuffer error:", e));
                 console.log("SourceBuffer created");
                 // Process any chunks that arrived before sourceopen
                 processQueue();
            } else {
                 console.error("MIME type not supported:", mimeCodec);
                 statusMessage.textContent = "Audio format not supported.";
            }

        } catch (e) {
            console.error("Error adding SourceBuffer:", e);
            statusMessage.textContent = "Error setting up audio player.";
        }
    }
     function handleBufferUpdateEnd() {
        isAppending = false;
        // Check if stream ended *while* we were appending the last chunk
        if (streamEnded && audioQueue.length === 0 && mediaSource.readyState === 'open' && sourceBuffer && !sourceBuffer.updating) {
             try {
                console.log("Ending MediaSource stream (updateend)");
                mediaSource.endOfStream();
             } catch(e){
                console.warn("Error ending stream on updateend:", e);
             }
        } else {
            // Continue processing queue
            processQueue();
        }
    }


    function processQueue() {
        if (sourceBuffer && !isAppending && !sourceBuffer.updating && audioQueue.length > 0) {
            isAppending = true;
            try {
                const chunk = audioQueue.shift();
                console.log("Appending buffer, size:", chunk.byteLength);
                sourceBuffer.appendBuffer(chunk);
                 // Start playing only if we have enough data and aren't already playing
                if (!isPlaying && audio.readyState >= 1 ) { // HAVE_METADATA or more
                    console.log("Attempting to play...");
                    audio.play().then(() => {
                        console.log("Playback started.");
                        isPlaying = true; // Set playing flag *after* successful play
                    }).catch(e => {
                        console.error("Audio play() failed:", e);
                         isPlaying = false; // Ensure flag is false on error
                         handleAudioError(e); // Treat play error as a general audio error
                    });
                }
            } catch (e) {
                console.error("Error appending buffer:", e);
                isAppending = false;
                 // If error is quota exceeded, might need buffer cleanup logic
                 // For now, just log it.
            }
        } 
        // If the queue is empty AND the fetch stream has ended, try ending the MediaSource stream
        else if (streamEnded && audioQueue.length === 0 && mediaSource && mediaSource.readyState === 'open' && sourceBuffer && !sourceBuffer.updating && !isAppending) {
             try {
                  console.log("Ending MediaSource stream (processQueue)");
                  mediaSource.endOfStream();
             } catch(e){
                  console.warn("Error ending stream on processQueue:", e);
             }
        }
    }


    function handleAudioPlay() {
        console.log("Audio onplay event fired");
        isPlaying = true; // Ensure flag is set
        avatarContainer.classList.add("speaking");
        statusMessage.textContent = "Zara is speaking...";
    }

    function handleAudioEnded() {
        console.log("Audio onended event fired");
        isPlaying = false;
        streamEnded = false; // Reset stream ended flag
        avatarContainer.classList.remove("speaking");
        statusMessage.textContent = "Press the button and start speaking.";
        // Clean up MediaSource URL
        if (audio.src) {
            URL.revokeObjectURL(audio.src);
            audio.removeAttribute('src'); // Remove src to allow setting it again
        }
         // Do NOT reset MediaSource here, let setupMediaSource handle it before next fetch
    }
     function handleAudioError(e) {
        // This is line 100 or near it
        console.error("Audio playback error:", e); // Log the actual event/error object
        statusMessage.textContent = "Error playing audio.";
        isPlaying = false;
        streamEnded = true; // Assume stream is unusable on error
        audioQueue = []; // Clear queue
        avatarContainer.classList.remove("speaking");

        // Attempt to abort the ongoing fetch if there is one
        if (currentFetchAbortController) {
             console.log("Aborting fetch due to audio error.");
             currentFetchAbortController.abort();
             currentFetchAbortController = null;
        }

        // Clean up MediaSource URL
         if (audio.src) {
             URL.revokeObjectURL(audio.src);
             audio.removeAttribute('src');
         }
        // Don't try to end stream on error, just clean up
         if (mediaSource && mediaSource.readyState === 'open' && sourceBuffer && !sourceBuffer.updating) {
             try {
                if(sourceBuffer.updating) sourceBuffer.abort(); // Abort pending appends if any
                // mediaSource.removeSourceBuffer(sourceBuffer); // Risky, might throw errors
             } catch(err){ console.warn("Error during error cleanup:", err); }
         }
         // Do NOT reset MediaSource here, let setupMediaSource handle it before next fetch
    }


    // --- Recognition Event Handlers ---
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        statusMessage.textContent = `You said: "${transcript}"`;
        sendToBackend(transcript);
    };

    recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        statusMessage.textContent = "I didn't quite catch that. Try again.";
        talkButton.classList.remove("listening");
        avatarContainer.classList.remove("listening");
    };

    recognition.onend = () => {
        talkButton.classList.remove("listening");
        avatarContainer.classList.remove("listening");
    };

    // --- Button Click Logic ---
    talkButton.addEventListener("click", () => {
        if (isPlaying) {
            console.log("Button clicked: Stopping audio");
            if(audio) audio.pause(); // Pause playback
            handleAudioEnded(); // Manually call ended to reset state
            if (currentFetchAbortController) { // Abort the ongoing fetch
                currentFetchAbortController.abort();
                currentFetchAbortController = null;
            }
            return;
        }

        if (talkButton.classList.contains("listening")) {
            console.log("Button clicked: Stopping listening");
            recognition.stop();
            return;
        }

        console.log("Button clicked: Starting listening");
        try {
            recognition.start();
            talkButton.classList.add("listening");
            avatarContainer.classList.add("listening");
            avatarContainer.classList.remove("speaking");
            statusMessage.textContent = "Listening...";
        } catch (error) {
            console.error("Error starting recognition:", error);
            statusMessage.textContent = "Error starting. Please try again.";
            talkButton.classList.remove("listening");
            avatarContainer.classList.remove("listening");
        }
    });

    // --- Fetch and Stream Audio ---
    async function sendToBackend(message) {
        console.log("Sending to backend:", message);
        statusMessage.textContent = "Thinking...";
        talkButton.classList.remove("listening");
        avatarContainer.classList.remove("listening");

        // Reset audio state before fetching new stream
        if (!setupMediaSource()) return; // Stop if MediaSource setup failed
        
         // Create an AbortController for this fetch request
        currentFetchAbortController = new AbortController();
        const signal = currentFetchAbortController.signal;


        try {
             console.log("Fetching audio stream...");
            const response = await fetch("/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: message }),
                 signal: signal // Pass the signal to fetch
            });

            if (!response.ok) {
                // Try to read error JSON if possible
                 let errorMsg = `Server error: ${response.status} ${response.statusText}`;
                 try {
                      const errorData = await response.json();
                      errorMsg = errorData.error || errorMsg;
                 } catch (e) { /* Ignore if response wasn't JSON */ }
                 throw new Error(errorMsg);
            }
             if (!response.body) {
                 throw new Error("Response body is null");
             }

            // Get the reader for the response body stream
            const reader = response.body.getReader();
            console.log("Got stream reader");

            // Read chunks from the stream
             while (true) {
                 const { done, value } = await reader.read();
                 if (done) {
                      console.log("Fetch stream finished.");
                      streamEnded = true; // Signal that the fetch is complete
                      processQueue(); // Process any remaining chunks and potentially end MediaSource
                      break;
                 }
                
                // Add the received audio chunk (Uint8Array) to our queue
                audioQueue.push(value);
                console.log("Received chunk, size:", value.byteLength, "Queue size:", audioQueue.length);
                processQueue(); // Try to append and play
            }
            
        } catch (error) {
             if (error.name === 'AbortError') {
                 console.log("Fetch aborted.");
                 // Error handled by audio pause/stop logic
                 statusMessage.textContent = "Stopped.";
             } else {
                 console.error("Error fetching or processing stream:", error);
                 statusMessage.textContent = error.message || "Error connecting to the brain.";
                 handleAudioError(error); // Trigger audio error handling
             }
        } finally {
            // Clear the abort controller once fetch is done or aborted
            currentFetchAbortController = null;
        }
    }

}); // <-- End of DOMContentLoaded