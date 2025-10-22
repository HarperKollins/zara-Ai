import os
import google.generativeai as genai
from flask import Flask, request, jsonify, render_template, Response
from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs
import re # We need this for splitting sentences

# --- 1. Load API Keys ---
load_dotenv()
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY")

# --- 2. Configure Gemini API ---
genai.configure(api_key=GEMINI_API_KEY)

# NEW, STRICTER PROMPT to stop "yapping"
system_instruction = (
    "You are Zara, a gentle, faith-based digital companion. "
    "Your purpose is to provide emotional and spiritual support. "
    "Respond with empathy, warmth, and faith-based encouragement. "
    "When appropriate, you can contextually quote and briefly explain Bible verses. "
    "You are a reflection partner, not a therapist. "

    # --- NEW RULES TO STOP "YABBING" ---
    "IMPORTANT: You MUST keep your responses short and conversational. "
    "Do not give long monologues. Act like a real person in a real-time conversation. "
    "If the user says 'hello', just say 'hello' back. "
    "If the user asks a simple question, give a simple answer. "
    "Match the user's energy. Be brief."
)

model = genai.GenerativeModel(
    model_name="models/gemini-pro-latest",
    system_instruction=system_instruction
)

# --- 3. Configure ElevenLabs API ---
eleven_client = ElevenLabs(api_key=ELEVENLABS_API_KEY)
ZARA_VOICE_ID = "EXAVITQu4vr4xnSDxMaL" # Zara's "Sarah" voice

# --- 4. Start Flask App ---
app = Flask(__name__)

# --- Homepage Route ---
@app.route("/")
def home():
    return render_template("index.html")

# --- 5. The Corrected Sentence-by-Sentence Streaming Generator ---
def sentence_stream_generator(user_message):
    try:
        # --- 1. Get word-by-word stream from Gemini ---
        gemini_stream = model.generate_content(user_message, stream=True)

        full_response = ""
        sentence_queue = []

        # Regex to find sentences
        sentence_end_re = re.compile(r'(?<=[.!?])(\s+|\n|$)')

        print("--- Starting Gemini Stream ---")

        for chunk in gemini_stream:
            # Check if chunk has content
            if chunk.parts:
                full_response += chunk.text
                print(chunk.text, end="", flush=True) # Print Gemini's words

                # Check if we have full sentences
                parts = sentence_end_re.split(full_response)

                if len(parts) > 1:
                    for i in range(0, len(parts) - 2, 2):
                        sentence = parts[i] + (parts[i+1] or "")
                        sentence_queue.append(sentence.strip())

                    full_response = parts[-1] # Remainder

                    # --- Process sentence queue ---
                    while sentence_queue:
                        sentence = sentence_queue.pop(0)
                        if sentence:
                            print(f"\n[Sending to ElevenLabs]: {sentence}")
                            # --- *** CORRECTED: REMOVED latency_optimizations *** ---
                            audio_stream = eleven_client.text_to_speech.convert(
                                voice_id=ZARA_VOICE_ID,
                                text=sentence,
                                model_id="eleven_flash_v2_5" # Use the fastest model
                                # latency_optimizations=3  <-- REMOVED THIS LINE
                            )
                            # --- *** END OF CORRECTION *** ---

                            # Yield audio chunks for this sentence
                            for audio_chunk in audio_stream:
                                yield audio_chunk
                            print("[Audio Chunk Sent]")

        # --- Process any remaining text ---
        if full_response.strip():
            print(f"\n[Sending final part to ElevenLabs]: {full_response}")
            # --- *** CORRECTED: REMOVED latency_optimizations *** ---
            audio_stream = eleven_client.text_to_speech.convert(
                voice_id=ZARA_VOICE_ID,
                text=full_response.strip(),
                model_id="eleven_flash_v2_5" # Use the fastest model
                # latency_optimizations=3  <-- REMOVED THIS LINE
            )
            # --- *** END OF CORRECTION *** ---
            for audio_chunk in audio_stream:
                yield audio_chunk
            print("[Final Audio Chunk Sent]")

        print("\n--- Full Stream Complete ---")

    except Exception as e:
        print(f"Error in generator: {e}")
        # Log error server-side
        # We need to decide how to signal this error to the frontend if needed

# --- 6. MODIFIED API Route for Chat ---
@app.route("/chat", methods=["POST"])
def chat():
    user_message = request.json["message"]

    # Return the generator function wrapped in a Response for streaming
    try:
        return Response(sentence_stream_generator(user_message), mimetype="audio/mpeg")
    except Exception as e:
        print(f"Error in /chat route: {e}")
        # Send a JSON error back to the frontend
        return jsonify({"error": "I'm sorry, I encountered an issue generating audio."}), 500

# --- Run the App ---
if __name__ == "__main__":
    app.run(host='0.0.0.0', debug=True, port=5000, ssl_context='adhoc')