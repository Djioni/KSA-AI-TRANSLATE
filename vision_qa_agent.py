#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Vision QA Agent for Arabic RTL slides using OpenAI GPT-4 Vision.

Run this AFTER Agent T + Agent D for final quality assurance.

Dependencies:
  pip install openai python-pptx pymupdf pillow
  brew install --cask libreoffice  # For PPTX → PDF rendering

Usage:
  python vision_qa_agent.py \
    --in slides_AR_polished.pptx \
    --report vision_report.json \
    --api-key sk-...

  Or use environment variable:
  export OPENAI_API_KEY=sk-...
  python vision_qa_agent.py --in slides.pptx --report report.json
"""

from __future__ import annotations

import argparse
import base64
import json
import subprocess
import shutil
import sys
import tempfile
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import List, Optional

def render_slide_to_image(pptx_path: Path, slide_num: int, output_path: Path, dpi: int = 150) -> bool:
    """
    Render a specific slide to PNG using LibreOffice.
    Returns True if successful.
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        print("Error: PyMuPDF (fitz) not installed. Run: pip install pymupdf")
        return False

    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        print("Error: LibreOffice not found. Install with: brew install --cask libreoffice")
        return False

    with tempfile.TemporaryDirectory(prefix="vision_render_") as td:
        temp_dir = Path(td)

        # Convert PPTX to PDF
        result = subprocess.run(
            [soffice, "--headless", "--convert-to", "pdf", "--outdir", str(temp_dir), str(pptx_path)],
            capture_output=True,
            text=True,
            timeout=60
        )

        if result.returncode != 0:
            print(f"Error converting to PDF: {result.stderr}")
            return False

        # Find generated PDF
        pdf_files = list(temp_dir.glob("*.pdf"))
        if not pdf_files:
            print("Error: No PDF generated")
            return False

        pdf_path = pdf_files[0]

        # Extract slide as image
        doc = fitz.open(str(pdf_path))
        if slide_num < 1 or slide_num > doc.page_count:
            print(f"Error: Slide {slide_num} out of range (1-{doc.page_count})")
            doc.close()
            return False

        page = doc.load_page(slide_num - 1)  # 0-indexed
        zoom = dpi / 72.0
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        pix.save(str(output_path))
        doc.close()

        return True

def analyze_slide_with_openai(image_path: Path, api_key: str, slide_num: int, model: str = "gpt-4o-mini-2024-07-18") -> dict:
    """
    Send slide image to OpenAI GPT-4 Vision API for analysis.
    Returns feedback about RTL layout, text visibility, and design issues.
    """
    try:
        from openai import OpenAI
    except ImportError:
        return {"error": "OpenAI package not installed. Run: pip install openai"}

    # Read and encode image
    with open(image_path, "rb") as f:
        image_data = base64.standard_b64encode(f.read()).decode("utf-8")

    # Determine media type
    ext = image_path.suffix.lower()
    if ext == ".png":
        image_url = f"data:image/png;base64,{image_data}"
    elif ext in [".jpg", ".jpeg"]:
        image_url = f"data:image/jpeg;base64,{image_data}"
    else:
        return {"error": f"Unsupported image format: {ext}"}

    client = OpenAI(api_key=api_key)

    prompt = """You are a professional Arabic RTL slide designer. Analyze this PowerPoint slide and provide feedback.

Check for these issues:
1. **Text Visibility**: Is all text clearly readable? Any white-on-white or low-contrast text?
2. **RTL Layout**: Does the layout follow Arabic RTL conventions? Are text boxes right-aligned?
3. **Icon Positioning**: Are icons positioned correctly for RTL (typically on the RIGHT of text)?
4. **Directional Elements**: Are arrows/chevrons pointing the correct direction for RTL flow?
5. **Spacing**: Are there any overlapping elements or awkward gaps?
6. **Overall Design**: Does it look professional and well-balanced?

Respond in JSON format:
{
  "text_visibility": {"score": 1-10, "issues": ["issue 1", "issue 2"]},
  "rtl_layout": {"score": 1-10, "issues": []},
  "icon_positioning": {"score": 1-10, "issues": []},
  "directional_elements": {"score": 1-10, "issues": []},
  "spacing": {"score": 1-10, "issues": []},
  "overall_score": 1-10,
  "summary": "Brief summary of main issues or 'Looks good!'",
  "recommendations": ["recommendation 1", "recommendation 2"]
}

If the slide looks perfect, use score 10 and empty issues arrays."""

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": prompt
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": image_url,
                                "detail": "high"
                            }
                        }
                    ]
                }
            ],
            max_tokens=2048,
            response_format={"type": "json_object"}
        )

        # Extract JSON from response
        text_content = response.choices[0].message.content

        analysis = json.loads(text_content.strip())
        analysis["slide"] = slide_num
        analysis["ok"] = True
        analysis["model"] = model

        return analysis

    except json.JSONDecodeError as e:
        return {
            "ok": False,
            "error": f"Failed to parse OpenAI response as JSON: {e}",
            "raw_response": text_content if 'text_content' in locals() else "No response"
        }
    except Exception as e:
        return {
            "ok": False,
            "error": str(e)
        }

@dataclass
class SlideAnalysis:
    slide: int
    text_visibility_score: int
    rtl_layout_score: int
    icon_positioning_score: int
    directional_elements_score: int
    spacing_score: int
    overall_score: int
    summary: str
    issues: List[str]
    recommendations: List[str]

def main(argv=None):
    ap = argparse.ArgumentParser(description="Vision QA Agent for RTL Arabic slides using OpenAI GPT-4 Vision")
    ap.add_argument("--in", dest="inp", required=True, help="Input PPTX to analyze")
    ap.add_argument("--report", required=True, help="Output JSON report path")
    ap.add_argument("--api-key", default=None, help="OpenAI API key (or use OPENAI_API_KEY env var)")
    ap.add_argument("--model", default="gpt-4o-mini-2024-07-18", help="OpenAI model to use (default: gpt-4o-mini-2024-07-18)")
    ap.add_argument("--slides", default=None, help="Comma-separated slide numbers (e.g., '1,3,5') or 'all'")
    ap.add_argument("--dpi", type=int, default=150, help="Image DPI for rendering (default: 150)")
    ap.add_argument("--keep-images", action="store_true", help="Keep rendered slide images in temp directory")
    args = ap.parse_args(argv)

    # Get API key
    api_key = args.api_key
    if not api_key:
        import os
        api_key = os.environ.get("OPENAI_API_KEY")

    if not api_key:
        print("Error: No API key provided. Use --api-key or set OPENAI_API_KEY environment variable")
        return 1

    pptx_path = Path(args.inp)
    if not pptx_path.exists():
        print(f"Error: Input file not found: {pptx_path}")
        return 1

    # Determine which slides to analyze
    try:
        import fitz
        with tempfile.TemporaryDirectory() as td:
            temp_dir = Path(td)
            soffice = shutil.which("soffice") or shutil.which("libreoffice")
            result = subprocess.run(
                [soffice, "--headless", "--convert-to", "pdf", "--outdir", str(temp_dir), str(pptx_path)],
                capture_output=True, text=True, timeout=60
            )
            pdf_files = list(temp_dir.glob("*.pdf"))
            if pdf_files:
                doc = fitz.open(str(pdf_files[0]))
                total_slides = doc.page_count
                doc.close()
            else:
                print("Error: Could not determine slide count")
                return 1
    except Exception as e:
        print(f"Error: Could not determine slide count: {e}")
        return 1

    if args.slides and args.slides != "all":
        slide_nums = [int(x.strip()) for x in args.slides.split(",")]
    else:
        slide_nums = list(range(1, total_slides + 1))

    print(f"🔍 Analyzing {len(slide_nums)} slide(s) with OpenAI GPT-4 Vision ({args.model})...")

    results = []
    temp_images_dir = Path(tempfile.mkdtemp(prefix="vision_qa_images_"))

    for slide_num in slide_nums:
        print(f"  Slide {slide_num}/{total_slides}...")

        # Render slide to image
        img_path = temp_images_dir / f"slide_{slide_num}.png"
        if not render_slide_to_image(pptx_path, slide_num, img_path, dpi=args.dpi):
            results.append({"slide": slide_num, "ok": False, "error": "Failed to render slide"})
            continue

        # Analyze with OpenAI
        analysis = analyze_slide_with_openai(img_path, api_key, slide_num, model=args.model)
        results.append(analysis)

    # Write report
    report_data = {
        "input_file": str(pptx_path),
        "total_slides": total_slides,
        "analyzed_slides": len(slide_nums),
        "model": args.model,
        "slides": results,
        "summary": {
            "all_passed": all(r.get("overall_score", 0) >= 8 for r in results if r.get("ok")),
            "average_score": sum(r.get("overall_score", 0) for r in results if r.get("ok")) / len(results) if results else 0
        }
    }

    Path(args.report).write_text(json.dumps(report_data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n✅ Vision QA report: {args.report}")

    # Print summary
    print("\n📊 Summary:")
    for r in results:
        if r.get("ok"):
            score = r.get("overall_score", 0)
            status = "✅" if score >= 8 else "⚠️ " if score >= 6 else "❌"
            print(f"  {status} Slide {r['slide']}: {score}/10 - {r.get('summary', 'No summary')}")
        else:
            print(f"  ❌ Slide {r.get('slide', '?')}: Error - {r.get('error', 'Unknown')}")

    # Cleanup
    if not args.keep_images:
        shutil.rmtree(temp_images_dir)
    else:
        print(f"\n📁 Slide images saved: {temp_images_dir}")

    return 0

if __name__ == "__main__":
    sys.exit(main())
