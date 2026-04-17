#!/usr/bin/env python3
"""
InstantMesh bridge — called by the Node.js API server as a subprocess.
Reads a base64-encoded PNG from stdin, runs the full pipeline
(upload → generate_mvs → make3d) via gradio_client, and writes
a JSON result to stdout.

Environment variables:
  HF_TOKEN   — HuggingFace API token (optional but recommended)

Exit codes:
  0  — success, JSON result on stdout
  1  — error, error message on stderr
"""

import sys
import os
import json
import base64
import tempfile
import traceback

def encode_file(path: str) -> str:
    with open(path, "rb") as f:
        data = f.read()
    ext = os.path.splitext(path)[1].lower()
    mime = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".obj": "application/octet-stream",
        ".glb": "model/gltf-binary",
    }.get(ext, "application/octet-stream")
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{b64}"

def main():
    try:
        from gradio_client import Client, handle_file
    except ImportError:
        print(json.dumps({"error": "gradio_client not installed"}), flush=True)
        sys.exit(1)

    hf_token = os.environ.get("HF_TOKEN")
    space_id = os.environ.get("HF_SPACE_ID", "SIGMitch/InstantMesh")
    sample_steps = int(os.environ.get("SIGMITCH_SAMPLE_STEPS", "75"))
    sample_seed  = int(os.environ.get("SIGMITCH_SAMPLE_SEED", "42"))

    # Read base64-encoded image from stdin
    raw_b64 = sys.stdin.read().strip()
    # Strip data URL prefix if present
    if "," in raw_b64:
        raw_b64 = raw_b64.split(",", 1)[1]
    img_bytes = base64.b64decode(raw_b64)

    with tempfile.TemporaryDirectory() as tmpdir:
        # Write image to a temp file
        img_path = os.path.join(tmpdir, "input.png")
        with open(img_path, "wb") as f:
            f.write(img_bytes)

        print(f"[bridge] Connecting to {space_id}...", file=sys.stderr, flush=True)
        client = Client(
            space_id,
            token=hf_token,
            verbose=False,
            httpx_kwargs={"timeout": 900},  # 15-minute timeout
        )

        print("[bridge] Running generate_mvs...", file=sys.stderr, flush=True)
        mvs_result = client.predict(
            input_image=handle_file(img_path),
            sample_steps=sample_steps,
            sample_seed=sample_seed,
            api_name="/generate_mvs",
        )
        # mvs_result is the path to the multiview image PNG
        mvs_path = mvs_result if isinstance(mvs_result, str) else str(mvs_result)
        print(f"[bridge] generate_mvs → {mvs_path}", file=sys.stderr, flush=True)
        multiview_b64 = encode_file(mvs_path)

        print("[bridge] Running make3d...", file=sys.stderr, flush=True)
        make3d_result = client.predict(api_name="/make3d")
        # make3d_result is (obj_path, glb_path)
        print(f"[bridge] make3d → {make3d_result}", file=sys.stderr, flush=True)

        if isinstance(make3d_result, (list, tuple)) and len(make3d_result) >= 2:
            obj_path = str(make3d_result[0])
            glb_path = str(make3d_result[1])
        elif isinstance(make3d_result, (list, tuple)) and len(make3d_result) == 1:
            obj_path = str(make3d_result[0])
            glb_path = obj_path
        else:
            obj_path = str(make3d_result)
            glb_path = obj_path

        obj_b64 = encode_file(obj_path) if os.path.exists(obj_path) else None
        glb_b64 = encode_file(glb_path) if os.path.exists(glb_path) else None

        result = {
            "success": True,
            "multiviewImageB64": multiview_b64,
            "modelObjB64": obj_b64,
            "modelGlbB64": glb_b64,
        }
        print(json.dumps(result), flush=True)

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({"error": str(e)}), flush=True)
        sys.exit(1)
