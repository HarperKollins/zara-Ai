document.addEventListener("DOMContentLoaded", () => {
    
    // --- Get HTML elements ---
    // const talkButton = document.getElementById("talkButton"); // REMOVED
    const avatarInteractArea = document.getElementById("avatarInteractArea"); // NEW: Get the avatar container
    const statusMessage = document.getElementById("statusMessage"); 
    const avatarContainer = document.querySelector(".avatar-container"); 

    // --- Speech Recognition (Input) ---
    // ... (rest of SpeechRecognition setup remains the same) ...
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition; 
    let recognition;
    if (!SpeechRecognition) {
        statusMessage.textContent = "Browser doesn't support speech recognition.";
        // talkButton.disabled = true; // REMOVED
        avatarInteractArea.style.cursor = 'not-allowed'; // Indicate disabled state
        return;
    }
    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;


    // --- Audio Playback (Output) using Media Source Extensions ---
    // ... (rest of MediaSource setup remains the same) ...
    let mediaSource = new MediaSource();
    let audio = new Audio();
    // audio.src = URL.createObjectURL(mediaSource); // Set later in setupMediaSource
    let sourceBuffer;
    let audioQueue = [];
    let isPlaying = false;
    let isAppending = false; 
    let streamEnded = false;
    let currentFetchAbortController = null; 

    // Initialize MediaSource setup
    if (!setupMediaSource()) {
        console.error("Initial MediaSource setup failed.");
        // Optionally disable interaction area
        avatarInteractArea.style.cursor = 'not-allowed';
    }


    function setupMediaSource() {
        // Clear previous state if necessary
        if (audio.src) {
            URL.revokeObjectURL(audio.src);
            audio.removeAttribute('src');
        }
        if (mediaSource && mediaSource.readyState !== 'closed') {
           // Attempt clean close if possible, might need more robust handling
           try { 
               if(sourceBuffer && sourceBuffer.updating) sourceBuffer.abort();
               //if (mediaSource.readyState === 'open') mediaSource.endOfStream(); // Might cause issues if called incorrectly
           } catch (e) { console.warn("Error during MediaSource reset:", e); }
        }


        if (!window.MediaSource) {
            console.error("MediaSource API not supported!");
            statusMessage.textContent = "Browser cannot play streamed audio.";
            return false;
        }
        mediaSource = new MediaSource();
        const audioURL = URL.createObjectURL(mediaSource);
        audio = new Audio(); // Recreate audio element
        audio.src = audioURL;
        audioQueue = [];
        isPlaying = false;
        isAppending = false;
        streamEnded = false;

        // Clear old listeners before adding new ones
        mediaSource.removeEventListener('sourceopen', handleSourceOpen);
        audio.removeEventListener('play', handleAudioPlay); // Use 'play' event
        audio.removeEventListener('ended', handleAudioEnded);
        audio.removeEventListener('error', handleAudioError);
        
        // Add new listeners
        mediaSource.addEventListener('sourceopen', handleSourceOpen);
        audio.addEventListener('play', handleAudioPlay); // Use 'play' event
        audio.addEventListener('ended', handleAudioEnded);
        audio.addEventListener('error', handleAudioError);
        console.log("MediaSource setup complete, waiting for sourceopen...");
        return true;
    }


    function handleSourceOpen() {
        console.log("MediaSource opened");
        if (!mediaSource || mediaSource.readyState !== 'open') {
             console.warn("SourceOpen called but MediaSource not ready or already closed.");
             return; 
        } 
        // Ensure previous source buffer is removed if exists
        // This is complex, might need more robust handling if re-setup is frequent
         if (sourceBuffer) {
              try {
                   if (sourceBuffer.updating) sourceBuffer.abort();
                   // mediaSource.removeSourceBuffer(sourceBuffer); // Can be problematic
              } catch(e){ console.warn("Error removing old source buffer:", e); }
              sourceBuffer = null; // Clear reference
         }


        try {
            const mimeCodec = 'audio/mpeg'; 
            if (MediaSource.isTypeSupported(mimeCodec)) {
                 sourceBuffer = mediaSource.addSourceBuffer(mimeCodec);
                 sourceBuffer.mode = 'sequence'; 
                 // Clear old listeners first
                 sourceBuffer.removeEventListener('updateend', handleBufferUpdateEnd);
                 sourceBuffer.removeEventListener('error', handleSourceBufferError);
                 // Add new listeners
                 sourceBuffer.addEventListener('updateend', handleBufferUpdateEnd);
                 sourceBuffer.addEventListener('error', handleSourceBufferError);

                 console.log("SourceBuffer created");
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
     function handleSourceBufferError(e){
         console.error("SourceBuffer error:", e);
         // Attempt recovery or notify user
         statusMessage.textContent = "Audio playback component error.";
         // Reset state carefully
         handleAudioError(new Error("SourceBuffer error")); // Trigger general audio error handling
     }


     function handleBufferUpdateEnd() {
        isAppending = false;
        // Check if stream ended *while* we were appending the last chunk
        if (streamEnded && audioQueue.length === 0 && mediaSource && mediaSource.readyState === 'open' && sourceBuffer && !sourceBuffer.updating) {
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
                 // Check readyState >= 1 (HAVE_METADATA) to avoid errors before metadata loaded
                if (!isPlaying && audio.readyState >= 1 && !audio.paused) {
                      console.log("Audio seems ready but play wasn't called or failed, retrying play...");
                       audio.play().then(() => {
                            console.log("Playback started on queue processing.");
                       }).catch(e => {
                            console.error("Retry play() failed:", e);
                            handleAudioError(e);
                       });
                } else if (!isPlaying && audio.readyState >= 1 && audio.paused) {
                     console.log("Attempting to play from processQueue (audio was paused)...");
                     audio.play().then(() => {
                            console.log("Playback started.");
                            // isPlaying = true; // Set in onplay handler
                       }).catch(e => {
                            console.error("Audio play() failed:", e);
                            handleAudioError(e); // Treat play error as a general audio error
                       });
                }


            } catch (e) {
                console.error("Error appending buffer:", e);
                isAppending = false;
                 // Handle specific errors like QuotaExceededError if needed
                 if (e.name === 'QuotaExceededError') {
                     console.warn("Buffer quota exceeded. Stream might be too fast or buffer too small.");
                     // Simple recovery: clear queue and hope it catches up. More advanced: buffer management.
                     audioQueue = []; 
                 } else {
                     handleAudioError(new Error("Error appending buffer"));
                 }
            }
        } 
        // If the queue is empty AND the fetch stream has ended, try ending the MediaSource stream
        else if (streamEnded && audioQueue.length === 0 && mediaSource && mediaSource.readyState === 'open' && sourceBuffer && !sourceBuffer.updating && !isAppending) {
             try {
                  console.log("Ending MediaSource stream (processQueue - empty queue, stream ended)");
                  mediaSource.endOfStream();
             } catch(e){
                  console.warn("Error ending stream on processQueue (empty):", e);
             }
        }
    }


    function handleAudioPlay() {
        console.log("Audio onplay event fired");
        isPlaying = true; // Crucial: Set playing flag HERE
        avatarContainer.classList.add("speaking"); 
        statusMessage.textContent = "Zara is speaking..."; 
    }

    function handleAudioEnded() {
        console.log("Audio onended event fired");
        isPlaying = false;
        streamEnded = false; // Reset stream ended flag for next interaction
        avatarContainer.classList.remove("speaking"); 
        statusMessage.textContent = "Tap Zara to start speaking."; // Updated text
        
        // Clean up MediaSource URL - important for memory management
        if (audio.src && audio.src.startsWith('blob:')) {
            URL.revokeObjectURL(audio.src);
            audio.removeAttribute('src'); 
            console.log("Revoked audio object URL");
        }
         // Don't reset MediaSource here; setupMediaSource will handle it
    }
     function handleAudioError(e) {
        console.error("Audio playback error event:", e); // Log the actual event/error object
        const errorMessage = e && e.message ? e.message : "Unknown audio error";
        statusMessage.textContent = `Error playing audio: ${errorMessage}`; 
        
        isPlaying = false;
        streamEnded = true; // Assume stream is unusable on error
        audioQueue = []; // Clear queue immediately
        avatarContainer.classList.remove("speaking"); 

        // Attempt to abort the ongoing fetch if there is one
        if (currentFetchAbortController) {
             console.log("Aborting fetch due to audio error.");
             currentFetchAbortController.abort();
             currentFetchAbortController = null;
        }

        // Clean up MediaSource URL
         if (audio.src && audio.src.startsWith('blob:')) {
             URL.revokeObjectURL(audio.src);
             audio.removeAttribute('src');
             console.log("Revoked audio object URL on error");
         }
        // Attempt to close MediaSource gracefully if possible
         if (mediaSource && mediaSource.readyState === 'open') {
             try {
                if(sourceBuffer && sourceBuffer.updating) sourceBuffer.abort();
                // Check if endOfStream can be called or if it throws error
                // if (!sourceBuffer || !sourceBuffer.updating) mediaSource.endOfStream(); 
             } catch(err){ console.warn("Error during error cleanup of MediaSource:", err); }
         }
         // Force readyState to closed if possible? Generally not directly possible.
         // Rely on setupMediaSource to create a fresh one next time.
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
        // talkButton.classList.remove("listening"); // REMOVED
        avatarContainer.classList.remove("listening"); 
    }; 

    recognition.onend = () => {
        // talkButton.classList.remove("listening"); // REMOVED
        avatarContainer.classList.remove("listening"); 
    }; 

    // --- Avatar Click Logic --- NEW ---
    avatarInteractArea.addEventListener("click", () => {
        if (!recognition) return; // Exit if recognition isn't supported

        if (isPlaying) {
            console.log("Avatar clicked: Stopping audio");
            if(audio) audio.pause(); 
            handleAudioEnded(); // Manually call ended to reset state
            if (currentFetchAbortController) { 
                currentFetchAbortController.abort();
                currentFetchAbortController = null;
            }
            return;
        }

        if (avatarContainer.classList.contains("listening")) { 
            console.log("Avatar clicked: Stopping listening");
            recognition.stop(); 
            return;
        }

        console.log("Avatar clicked: Starting listening");
        try {
            recognition.start(); 
            // talkButton.classList.add("listening"); // REMOVED
            avatarContainer.classList.add("listening"); 
            avatarContainer.classList.remove("speaking"); 
            statusMessage.textContent = "Listening..."; 
        } catch (error) {
            console.error("Error starting recognition:", error); 
            statusMessage.textContent = "Error starting. Please try again."; 
            // talkButton.classList.remove("listening"); // REMOVED
            avatarContainer.classList.remove("listening"); 
        }
    }); 

    // --- Fetch and Stream Audio ---
    async function sendToBackend(message) {
        console.log("Sending to backend:", message);
        statusMessage.textContent = "Thinking..."; 
        // talkButton.classList.remove("listening"); // REMOVED
        avatarContainer.classList.remove("listening"); 

        // Reset audio state and setup MediaSource for the new stream
        if (!setupMediaSource()) {
             statusMessage.textContent = "Cannot initialize audio player.";
             return; // Stop if MediaSource setup failed
        }
        
        currentFetchAbortController = new AbortController();
        const signal = currentFetchAbortController.signal;

        try {
             console.log("Fetching audio stream...");
            const response = await fetch("/chat", { 
                method: "POST", 
                headers: { "Content-Type": "application/json" }, 
                body: JSON.stringify({ message: message }), 
                 signal: signal 
            });

            if (!response.ok) {
                 let errorMsg = `Server error: ${response.status} ${response.statusText}`;
                 try {
                      const errorData = await response.json();
                      errorMsg = errorData.error || errorMsg;
                 } catch (e) { /* Ignore */ }
                 throw new Error(errorMsg);
            }
             if (!response.body) {
                 throw new Error("Response body is null");
             }

            const reader = response.body.getReader();
            console.log("Got stream reader");

             while (true) {
                 const { done, value } = await reader.read();
                 if (done) {
                      console.log("Fetch stream finished.");
                      streamEnded = true; 
                      processQueue(); // Process any remaining chunks and end MediaSource
                      break;
                 }
                
                audioQueue.push(value);
                console.log("Received chunk, size:", value.byteLength, "Queue size:", audioQueue.length);
                processQueue(); // Try to append and play
            }
            
        } catch (error) {
             if (error.name === 'AbortError') {
                 console.log("Fetch aborted by user.");
                 statusMessage.textContent = "Stopped."; // Or keep "Tap Zara..."
                 handleAudioEnded(); // Reset state properly
             } else {
                 console.error("Error fetching or processing stream:", error); 
                 statusMessage.textContent = error.message || "Error connecting to the brain."; 
                 handleAudioError(error); // Trigger audio error handling
             }
        } finally {
            currentFetchAbortController = null; // Clear controller when done/aborted
        }
    }

    // --- Initial setup ---
    statusMessage.textContent = "Tap Zara to start speaking."; // Set initial text

}); // <-- End of DOMContentLoaded