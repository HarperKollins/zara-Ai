import os
from elevenlabs.client import ElevenLabs
from dotenv import load_dotenv

# Load the .env file to get the API key
load_dotenv()
API_KEY = os.environ.get("ELEVENLABS_API_KEY")

if not API_KEY:
    print("Error: ELEVENLABS_API_KEY not found in .env file.")
    print("Please add it and try again.")
else:
    try:
        # Initialize the client
        client = ElevenLabs(api_key=API_KEY)

        # Fetch all available voices
        response = client.voices.get_all()

        print("--- Your Available Voices ---")

        # Loop through the list of voices and print their name and ID
        for voice in response.voices:
            print(f"Name: {voice.name}, \t Voice ID: {voice.voice_id}")

        print("-----------------------------")
        print("Find the voice you want for Zara and copy its 'Voice ID'.")

    except Exception as e:
        print(f"An error occurred: {e}")
        print("Please check your API key and permissions.")