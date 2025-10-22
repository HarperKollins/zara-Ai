import os
import google.generativeai as genai
from flask import Flask, request, jsonify, render_template 
from dotenv import load_dotenv

# Load the secret API key from the .env file
load_dotenv()
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

# --- Configure the Gemini API with your key ---
# (Make sure there's NO line here setting 'client_options' or 'api_version')
genai.configure(api_key=GEMINI_API_KEY)

# This is the "system prompt"
system_instruction = (
    "You are Zara, a gentle, faith-based digital companion. "
    "Your purpose is to provide emotional and spiritual support. "
    "Respond with empathy, warmth, and faith-based encouragement. "
    "When appropriate, you can contextually quote and briefly explain Bible verses. "
    "You are a reflection partner, not a therapist. "
    "Keep your responses kind and not overly long."
)

# Initialize the Gemini model using the correct name from the list
model = genai.GenerativeModel(
    model_name="models/gemini-pro-latest", # Use the name from the list we got
    system_instruction=system_instruction
)

# --- Start Flask App ---
app = Flask(__name__)

# --- Homepage Route ---
@app.route("/")
def home():
    return render_template("index.html")

# --- API Route for Chat ---
@app.route("/chat", methods=["POST"])
def chat():
    user_message = request.json["message"]
    
    try:
        response = model.generate_content(user_message)
        bot_message = response.text
    except Exception as e:
        # Print the REAL error to the terminal for debugging
        print(f"Error generating content: {e}") 
        bot_message = "I'm sorry, I'm having a little trouble connecting right now. Please try again in a moment."
    
    return jsonify({"response": bot_message})

# --- Run the App with HTTPS for local mic access ---
if __name__ == "__main__":
    app.run(host='0.0.0.0',debug=True, port=5000)