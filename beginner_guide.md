# The Complete Beginner's Guide to Your AI Web App

You used AI to build a cutting-edge web application, and it works flawlessly. But how does it actually work? This guide breaks down exactly what we built, how the pieces talk to each other, and how deployment works in plain English.

---

## 1. The Big Picture: How Do Websites Actually Work?
When you type a URL into a browser (like `google.com`), two main things happen:
1. **The Frontend (The Face):** Your browser downloads HTML, CSS, and JavaScript. This is the visual interface you interact with. It runs entirely on *your* computer/phone.
2. **The Backend (The Brain):** When you click "Search", the Frontend sends a message over the internet to a powerful computer sitting in a data center. That computer runs the Backend code, fetches data, does the heavy lifting, and sends the answer back to your browser.

In our project, we built both halves.

---

## 2. Our Tech Stack (The Tools We Used)

### The Frontend (`/frontend` folder)
* **React & Vite:** React is a library that lets us build UI components (like a `SearchBox` or an `EvidenceList`) instead of writing one massive HTML file. Vite is a tool that bundles all these React files together instantly so the browser can read them.
* **TypeScript:** Like regular JavaScript, but with strict rules. If we try to pass text into a box that expects a number, TypeScript throws an error before the code even runs, preventing bugs.
* **Glassmorphism (CSS):** The beautiful, semi-transparent frosted-glass look of your app.

### The Backend (`/backend` folder)
* **Python & FastAPI:** Python is the programming language. FastAPI is a modern framework that makes setting up a web server incredibly easy and fast. It "listens" for requests from the Frontend.
* **LangGraph:** This is the AI's logic engine. Instead of a simple "prompt in, text out", LangGraph creates a "state machine." It tells the AI: *"First go fetch CrossRef data. If that succeeds, go fetch Semantic Scholar data. If that fails, go to OpenAlex instead."*
* **ChromaDB & Hugging Face:** This is the AI's memory (RAG). It converts text into math (vectors) using Hugging Face models, saves it in a local database (ChromaDB), and lets the AI search through it to ground its summaries in actual facts.

---

## 3. Step-by-Step: The Lifecycle of a Request

Here is exactly what happens when a user types a DOI and clicks "Search":

1. **The Click (Frontend):** The React app takes the DOI and makes an HTTP `POST` request to the Backend. Think of this like sending a text message to a phone number.
2. **The Reception (FastAPI):** The FastAPI server (running on `localhost:8000`) receives the text message. It checks the data using `Pydantic` (making sure it's actually a valid request).
3. **The Agent Kicks In (LangGraph):** 
   - The FastAPI server hands the DOI to LangGraph.
   - LangGraph runs the `fetch_crossref` function. The server reaches out over the internet to CrossRef's actual API and downloads JSON data about the paper.
   - It then runs the `fetch_semantic_scholar` function.
   - It saves all this retrieved evidence into **ChromaDB**.
4. **The Synthesis (Hugging Face):** The AI reads the evidence from ChromaDB and writes the final summary.
5. **The Reply:** FastAPI takes the summary and the evidence list, packages it into a JSON response, and texts it back to the Frontend.
6. **The Render (React):** The React app receives the JSON, updates its "State", and immediately redraws the screen to show the beautiful glass panels filled with data.

---

## 4. How We Built It (What We Actually Did)

1. **Scaffolding:** We created the folder structure. We separated `/frontend` and `/backend` so they don't tangle with each other.
2. **Writing the Backend APIs:** We wrote the Python scripts that talk to CrossRef and Semantic Scholar.
3. **Designing the UI:** We wrote React components and styled them using CSS to look premium and modern.
4. **Connecting them:** We told the Frontend React app to send its requests to `http://localhost:8000` (the backend server).
5. **Dockerization:** We wrote `Dockerfile`s. A Dockerfile is essentially a recipe. It tells a completely blank computer how to install Python/Node, copy our code, and run it. This guarantees the app works anywhere.
6. **CI/CD (GitHub Actions):** We wrote a script `.github/workflows/ci.yml`. Now, every time you push code to GitHub, a robot at GitHub downloads your code, runs your automated tests, and makes sure you didn't break anything.

---

## 5. How Deployment Actually Works

Right now, your app runs on `localhost`. That means your laptop is both the server and the client. If you close your laptop, the app dies. 

To share it with the world, we need to **Deploy** it. This means renting a computer (a server) in a data center that never turns off.

### Using Render (The easiest way)

We are using a platform called **Render**. Render is basically a hosting robot.

1. **The Blueprint (`render.yaml`):** I created this file in your project. It says to Render: *"Hey, I have two web services. One is a Python backend, the other is a React frontend."*
2. **The Connection:** When you log into Render and connect your GitHub account, Render reads that Blueprint.
3. **The Build:** Render rents a blank computer in the cloud. It reads your `Dockerfile`, installs Python, installs your requirements, and starts the FastAPI server. It does the same for the React frontend, giving them public URLs (e.g., `https://ai-research-backend.onrender.com`).
4. **The Injection:** The Blueprint automatically tells the Frontend what the Backend's new public URL is, so they can talk to each other over the internet instead of `localhost`.

### Your Job Now
All you have to do to deploy this is:
1. Go to **Render.com** and create a free account.
2. Go to **Blueprints** -> **New Blueprint**.
3. Connect your GitHub repository (`Data-eng15/Ai-research-impact-summariser`).
4. Render will automatically build and launch your application. You literally just watch the progress bar finish, and it will hand you a live URL you can share with your friends!
