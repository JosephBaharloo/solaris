import torch
from model import Qwen3Model, Args
from safetensors.torch import load_file
def assign(left, right):
        if left.shape != right.shape:
            raise ValueError(f"Shape mismatch. Left: {left.shape}, Right: {right.shape}")
        with torch.no_grad():
            if isinstance(right, torch.Tensor):
                left.copy_(right)
            else:
                left.copy_(torch.as_tensor(right, dtype=left.dtype, device=left.device))
        return left

def loading_weights(params, model: Qwen3Model, args: Args) -> None:
  model.tok_emb.weight  = assign(model.tok_emb.weight,    params["model.embed_tokens.weight"])
  model.out_head.weight = assign(model.out_head.weight,   params["lm_head.weight"])
  model.final_norm.scale= assign(model.final_norm.scale,  params["model.norm.weight"])
  for i in range(args.n_layers):
    block = model.trf_blocks[i]
    block.norm_1.scale          = assign(block.norm_1.scale,         params[f"model.layers.{i}.input_layernorm.weight"])
    block.norm_2.scale          = assign(block.norm_2.scale,         params[f"model.layers.{i}.post_attention_layernorm.weight"])
    block.ffn.fc1.weight        = assign(block.ffn.fc1.weight,       params[f"model.layers.{i}.mlp.gate_proj.weight"])
    block.ffn.fc2.weight        = assign(block.ffn.fc2.weight,       params[f"model.layers.{i}.mlp.up_proj.weight"])
    block.ffn.fc3.weight        = assign(block.ffn.fc3.weight,       params[f"model.layers.{i}.mlp.down_proj.weight"])
    block.attn.q_proj.weight    = assign(block.attn.q_proj.weight,   params[f"model.layers.{i}.self_attn.q_proj.weight"])
    block.attn.q_norm.scale     = assign(block.attn.q_norm.scale,    params[f"model.layers.{i}.self_attn.q_norm.weight"])
    block.attn.k_proj.weight    = assign(block.attn.k_proj.weight,   params[f"model.layers.{i}.self_attn.k_proj.weight"])
    block.attn.k_norm.scale     = assign(block.attn.k_norm.scale,    params[f"model.layers.{i}.self_attn.k_norm.weight"])
    block.attn.v_proj.weight    = assign(block.attn.v_proj.weight,   params[f"model.layers.{i}.self_attn.v_proj.weight"])
    block.attn.out_proj.weight  = assign(block.attn.out_proj.weight, params[f"model.layers.{i}.self_attn.o_proj.weight"])

