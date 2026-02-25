🚀 FFCS Master – VIT Timetable Generator

FFCS Master is a timetable generation tool built for VIT students to create clash-free schedules based on slot and faculty selection.

🛠 Tech Stack

Frontend: HTML, CSS, JavaScript

Backend: Python (Flask)

Logic Engine: Constraint-based clash detection

Local Server: Python HTTP Server

# How to Run the Project

📍 Navigate to the project folder first
Example:

cd c:\bhavye\New folder (2)

You need to run the project in 2 separate terminals.

🔹 Terminal 1 – Backend (Flask API on Port 5000)

Install Flask (if not already installed):

py -m pip install flask

Run the backend:

py app.py

Backend will run on:

http://localhost:5000
🔹 Terminal 2 – Frontend (Serve HTML)

To properly serve the frontend (so window.location.hostname works correctly), run:

py -m http.server 5500
🌐 Open in Browser

After both servers are running, open:

http://localhost:5500/index.html
WE PRIORTISE slots>>>faculty
## Environment Setup

Create a `.env` file in the project root and add:

BACKBOARD_API_KEY=your_api_key_here  
BACKBOARD_ASSISTANT_ID=your_assistant_id_here

Environment files are intentionally not committed for security reasons.
