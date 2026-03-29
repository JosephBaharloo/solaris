<div align="center">
  <h1>🌌 SOLARIS</h1>
  <p><strong>Space Weather Intelligence & Local LLM Dashboard</strong></p>
  
  <p>
    <img src="https://img.shields.io/badge/Python-3.9+-blue.svg" alt="Python Version" />
    <img src="https://img.shields.io/badge/PyTorch-2.0+-EE4C2C.svg" alt="PyTorch Version" />
    <img src="https://img.shields.io/badge/FastAPI-0.100+-009688.svg" alt="FastAPI Version" />
    <img src="https://img.shields.io/badge/Three.js-0.170.0-black.svg" alt="Three.js" />
    <img src="https://img.shields.io/badge/Vite-6.0.0-646CFF.svg" alt="Vite" />
  </p>
</div>

---

SOLARIS is a comprehensive space weather detection, alert, and tracking system. It integrates a high-performance 3D visualization frontend, a specialized FastAPI telemetry backend, and a **fully custom implementation of the Qwen3 Large Language Model** running locally on CUDA for real-time situational reporting.

## 🚀 Key Features

### Custom Model Architecture
* **Full Qwen3 1.7B Architecture Implementation**: Built entirely from scratch in PyTorch (no Hugging Face `transformers` dependency required).
* **Manual Weight Loading**: Direct consumption of `.safetensors` files with precise parameter mapping to custom layers.
* **Inference with KV-Cache**: Supports Sliding Window Attention and efficient KV-caching.
* **TurboQuant Implemented**: Features advanced KV-cache quantization using Product and MSE modes for drastically reduced memory usage.
* **Minimal Dependencies**: Only relies on `torch`, `safetensors`, `fastapi`, `uvicorn`, and `tokenizers`.
* **Uses Hugging Face Weights**: Directly maps from official Qwen3 weights.

### Full-Stack Dashboard
* **3D Frontend**: Built with Vite, Three.js, and Chart.js for an immersive SHIELD-like command center experience.
* **Live Telemetry API**: Aggregates data from NOAA/SWPC (solar wind, Kp index, X-ray flux), N2YO (real-time satellite tracking), and OpenSky (flight tracking).
* **Local LLM Reporting**: The frontend streams situation reports directly from the custom local LLM via Server-Sent Events (SSE).

---

## 🏗️ Architecture

1. **Frontend (`/Frontend`)**: A highly interactive 3D web application.
2. **Backend API (`/Backend`)**: A FastAPI service acting as the central nervous system, fetching live data and proxying LLM requests on port `8000`.
3. **Model Service (`/Model`)**: The isolated PyTorch implementation of Qwen3, managed by a dedicated FastAPI server that keeps model weights hot in VRAM on port `8001`.

---

## 🛠️ Installation & Requirements

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/solaris.git
cd solaris
```

### 2. Install Dependencies

**Backend & Model Services** (Requires Python 3.9+ & CUDA-capable GPU):
```bash
# Model Service Dependencies
cd Model
pip install -r requirements.txt

# Backend API Dependencies
cd ../Backend
pip install -r requirements.txt
```

**Frontend Dashboard** (Requires Node.js 18+):
```bash
cd ../Frontend
npm install
```

---

## 📥 Downloading Model Weights from Hugging Face

You need to download the official Qwen3 1.7B weights from Hugging Face to run the local LLM.

1. **Install `huggingface_hub`**:
   ```bash
   pip install huggingface_hub
   ```

2. **Login to Hugging Face**:
   ```bash
   huggingface-cli login
   ```

3. **Download the model weights**:
   ```bash
   huggingface-cli download Qwen/Qwen3-1.7B --local-dir ./Weights
   ```

> **Note:** Ensure that the downloaded `.safetensors` model files and the `tokenizer.json` are placed in the `Model/` directory so that `inference.py` can load them successfully.

---

## 🖥️ Running the Application

To run the full SOLARIS application, you must start all three services in separate terminals:

### 1. Start the Model Inference Service
Loads the Qwen weights into your GPU and exposes the `/infer-stream` endpoint on port `8001`.
```bash
cd Model
python inference.py
```

### 2. Start the Backend Proxy API
Handles all external data integrations and proxies LLM streams. Runs on port `8000`.
```bash
cd Backend
python main.py
```

### 3. Start the Frontend Dashboard
Launches the local Vite development server.
```bash
cd Frontend
npm run dev
```

Visit the local URL provided by Vite (e.g., `http://localhost:5173`) to open the SOLARIS command center!

---

<div align="center">
  <i>Developed for Advanced Space Weather Monitoring & Local AI Processing.</i>
</div>
