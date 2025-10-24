import os
import google.generativeai as genai
from flask import Flask, request, jsonify, render_template
from dotenv import load_dotenv

# --- 1. Load API Keys ---
load_dotenv()
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

# --- 2. Configure Gemini API ---
genai.configure(api_key=GEMINI_API_KEY)

system_instruction = (
    "You are Zara, a gentle, faith-based digital companion. "
    "Your purpose is to provide emotional and spiritual support. "
    "Respond with empathy, warmth, and faith-based encouragement. "
    "When appropriate, you can contextually quote and briefly explain Bible verses. "
    "You are a reflection partner, not a therapist. "
    "IMPORTANT: You MUST keep your responses short and conversational. "
    "Do not give long monologues. Act like a real person in a real-time conversation. "
    "If the user says 'hello', just say 'hello' back. "
    "If the user asks a simple question, give a simple answer. "
    "Match the user's energy. Be brief. "
    # --- NEW: Instruct AI about visual context ---
    "You can also see the user through a camera. If the user asks what they are doing or refers to something visual, use the provided visual context in your response."
)

model = genai.GenerativeModel(
    model_name="models/gemini-pro-latest",
    system_instruction=system_instruction
)

# --- 3. Start Flask App ---
app = Flask(__name__)

# --- Homepage Route ---
@app.route("/")
def home():
    return render_template("index.html")

# --- 5. UPDATED API Route for Chat (Receives Context) ---
@app.route("/chat", methods=["POST"])
def chat():
    # --- Extract message and context from request ---
    data = request.json
    user_message = data.get("message", "")
    visual_context = data.get("visualContext", {}) # Get context object or empty dict
    print(f"Received message: '{user_message}', Context: {visual_context}") # Log received data
    # ----------------------------------------------------

    # --- Build the prompt for Gemini, including context ---
    context_description = []
    if visual_context.get("isSmiling"):
        context_description.append("User is currently smiling.")
    # Add more conditions here later (frowning, nodding etc.)

    fingers = visual_context.get("fingersUp", 0)
    if fingers > 0:
        context_description.append(f"User is holding up {fingers} finger{'s' if fingers != 1 else ''}.")
    
    # Format the final prompt
    prompt_for_gemini = user_message
    if context_description:
        prompt_for_gemini += f"\n[Zara's current observation: {', '.join(context_description)}]"
    
    print(f"Prompt sent to Gemini: {prompt_for_gemini}")
    # --------------------------------------------------------

    try:
        # --- Get text response from Gemini using the combined prompt ---
        gemini_response = model.generate_content(prompt_for_gemini) # Send combined prompt
        bot_message_text = gemini_response.text
        print(f"Gemini response: {bot_message_text}")

        # --- Return the text as JSON ---
        return jsonify({"response": bot_message_text})

    except Exception as e:
        # ...(Keep existing error handling)...
        print(f"Error communicating with Gemini: {e}")
        error_message = "I'm sorry, I'm having trouble thinking right now."
        if "quota" in str(e).lower(): error_message = "High demand. Please wait a moment."
        return jsonify({"error": error_message}), 500

# --- Run the App ---
if __name__ == "__main__":
    app.run(host='0.0.0.0', debug=True, port=5000, ssl_context='adhoc')