"""
SOLARIS — Model Inference Service
Qwen3-0.6B local LLM running on CUDA, exposed as a FastAPI endpoint.
Weights are loaded once at startup and kept warm in GPU memory.
"""
import sys
import time
import torch
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from accelerate import init_empty_weights
from accelerate.utils import set_module_tensor_to_device

# ═══ CUDA CHECK ═══
if not torch.cuda.is_available():
    print("=" * 60)
    print("  FATAL: CUDA is NOT available.")
    print("  The SOLARIS Model Service requires a CUDA-capable GPU.")
    print("  Please ensure PyTorch is installed with CUDA support.")
    print("=" * 60)
    sys.exit(1)

device = "cuda"
print(f"✅ CUDA available: {torch.cuda.get_device_name(0)}")

# ═══ MODEL LOADING (runs once at import time) ═══
print("⏳ Loading model weights into GPU memory... (This only happens once)")

from model import Qwen3Model, Args
from tokenizer import Qwen3Tokenizer
from safetensors.torch import load_file
from weight_load import loading_weights

# args = Args()
# model = Qwen3Model(args)
tokenizer = Qwen3Tokenizer(
    tokenizer_file_path="tokenizer.json",
    repo_id="drive/MyDrive/Qwen3-0.6B",
    apply_chat_template=True,
    add_generation_prompt=True,
    add_thinking=False
)

# weights = {}
# for i in range(1, 3):
#     w = load_file(f"model-0000{i}-of-00002.safetensors")
#     weights.update(w)

# loading_weights(weights, model, args)
# del weights

# model.to(device)
# model.eval()
device = "cuda" if torch.cuda.is_available() else "cpu"
# Use bfloat16 to cut memory usage and loading time in half
dtype = torch.bfloat16 

print("⏳ Initializing empty model structure...")
args = Args()
with init_empty_weights():
    model = Qwen3Model(args)
    # Add this right after model = Qwen3Model(args)
    print("🔍 Your Model's Internal Names:")
    for name, _ in model.named_parameters():
        print(f" - {name}")

print("🚀 Loading weights with precise mapping...")
files = ["model-00001-of-00002.safetensors", "model-00002-of-00002.safetensors"]

for f in files:
    state_dict = load_file(f)
    for param_name, param_tensor in state_dict.items():
        target_name = param_name
        
        target_name = target_name.replace("model.embed_tokens", "tok_emb")
        target_name = target_name.replace("model.layers", "trf_blocks")
        target_name = target_name.replace("self_attn", "attn")
        target_name = target_name.replace("o_proj", "out_proj")
        target_name = target_name.replace("input_layernorm", "norm_1")
        target_name = target_name.replace("post_attention_layernorm", "norm_2")
        target_name = target_name.replace("mlp", "ffn")
        
        target_name = target_name.replace("gate_proj", "fc1")
        target_name = target_name.replace("up_proj", "fc2")
        target_name = target_name.replace("down_proj", "fc3")
        
        if "norm" in target_name and target_name.endswith(".weight"):
            target_name = target_name.replace(".weight", ".scale")
            
        target_name = target_name.replace("model.norm.scale", "final_norm.scale")
        target_name = target_name.replace("lm_head", "out_head")

        try:
            set_module_tensor_to_device(
                model, 
                target_name, 
                device=device, 
                value=param_tensor.to(dtype)
            )
        except AttributeError:
            print(f"❌ Failed to find: {target_name} (from {param_name})")
            
    del state_dict
    print(f"✅ Shard {f} loaded.")
model.to(device)
print("✨ Model materialized successfully!")
model.eval()
print("✅ Model loaded and ready on GPU")

# ═══ INFERENCE FUNCTION ═══
@torch.inference_mode()
def prompt_ai(prompt_coming: str, max_new_tokens: int = 2048) -> dict:
    """Run inference and return the full response with timing stats."""
    input_token_ids = tokenizer.encode(prompt_coming)
    input_token_ids_tensor = torch.tensor(input_token_ids, device=device).unsqueeze(0)

    MAX_NEW = max_new_tokens
    MAX_SEQ = input_token_ids_tensor.shape[1] + MAX_NEW + 10

    torch.cuda.reset_peak_memory_stats()

    start_time = time.perf_counter()
    generated_tokens = 0
    full_response = ""

    for token in model.generate_with_cache(
        token_ids=input_token_ids_tensor,
        max_new_tokens=MAX_NEW,
        eos_token_id=tokenizer.eos_token_id,
        max_seq_len=MAX_SEQ,
    ):
        generated_tokens += 1
        token_id = token.squeeze(0).tolist()
        word = tokenizer.decode(token_id)
        print(word, end="", flush=True)
        full_response += word

    elapsed = time.perf_counter() - start_time
    tokens_per_sec = generated_tokens / elapsed if elapsed > 0 else 0.0
    print(f"\n\n[⚡ Inference Speed: {tokens_per_sec:.1f} tokens/sec]")

    return {
        "response": full_response,
        "tokens_generated": generated_tokens,
        "elapsed_seconds": round(elapsed, 2),
        "tokens_per_sec": round(tokens_per_sec, 1),
    }


# ═══ FASTAPI APP ═══
app = FastAPI(title="SOLARIS Model Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class InferRequest(BaseModel):
    prompt: str
    max_new_tokens: Optional[int] = 2048


class InferResponse(BaseModel):
    response: str
    tokens_generated: int
    elapsed_seconds: float
    tokens_per_sec: float


class HealthResponse(BaseModel):
    status: str
    device: str
    gpu_name: str


@app.post("/infer", response_model=InferResponse)
def infer(req: InferRequest):
    """Run LLM inference on the given prompt (non-streaming)."""
    result = prompt_ai(req.prompt, max_new_tokens=req.max_new_tokens or 2048)
    return result


@app.post("/infer-stream")
def infer_stream(req: InferRequest):
    """Stream LLM tokens as Server-Sent Events (SSE) in real-time."""
    from fastapi.responses import StreamingResponse
    import json

    def generate():
        input_token_ids = tokenizer.encode(req.prompt)
        input_token_ids_tensor = torch.tensor(input_token_ids, device=device).unsqueeze(0)

        max_new = req.max_new_tokens or 2048
        max_seq = input_token_ids_tensor.shape[1] + max_new + 10

        torch.cuda.reset_peak_memory_stats()
        start_time = time.perf_counter()
        generated_tokens = 0

        with torch.inference_mode():
            for token in model.generate_with_cache(
                token_ids=input_token_ids_tensor,
                max_new_tokens=max_new,
                eos_token_id=tokenizer.eos_token_id,
                max_seq_len=max_seq,
            ):
                generated_tokens += 1
                token_id = token.squeeze(0).tolist()
                word = tokenizer.decode(token_id)
                print(word, end="", flush=True)

                # Send token as SSE event
                event = json.dumps({"token": word})
                yield f"data: {event}\n\n"

        elapsed = time.perf_counter() - start_time
        tokens_per_sec = generated_tokens / elapsed if elapsed > 0 else 0.0
        print(f"\n\n[⚡ Inference Speed: {tokens_per_sec:.1f} tokens/sec]")

        # Send final stats event
        done_event = json.dumps({
            "done": True,
            "tokens_generated": generated_tokens,
            "elapsed_seconds": round(elapsed, 2),
            "tokens_per_sec": round(tokens_per_sec, 1),
        })
        yield f"data: {done_event}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/health", response_model=HealthResponse)
def health():
    return {
        "status": "ok",
        "device": device,
        "gpu_name": torch.cuda.get_device_name(0),
    }


if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting SOLARIS Model Service on port 8001...")
    uvicorn.run(app, host="0.0.0.0", port=8001)