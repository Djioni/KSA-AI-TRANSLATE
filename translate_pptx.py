#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
One-Command PowerPoint Translation to Arabic RTL

This script does EVERYTHING in one command:
1. Extracts English text from PowerPoint
2. Translates to Arabic using GPT-4
3. Applies RTL transformation

Usage:
    python translate_pptx.py input.pptx

    # Or specify output location:
    python translate_pptx.py input.pptx --out output.pptx
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


def run_command(cmd, description):
    """Run a command and show progress."""
    print(f"\n{'='*60}")
    print(f"  {description}")
    print(f"{'='*60}")
    result = subprocess.run(cmd, shell=True, capture_output=False, text=True)
    if result.returncode != 0:
        print(f"❌ ERROR: {description} failed!")
        sys.exit(1)
    print(f"✓ {description} complete")


def translate_pptx(input_pptx: str, output_pptx: str = None):
    """
    One-command translation pipeline.

    Args:
        input_pptx: Path to English PowerPoint file
        output_pptx: Optional output path (default: input_AR.pptx)
    """
    # Validate input
    input_path = Path(input_pptx).resolve()
    if not input_path.exists():
        print(f"❌ ERROR: File not found: {input_pptx}")
        sys.exit(1)

    # Determine output path
    if output_pptx:
        output_path = Path(output_pptx).resolve()
    else:
        # Default: same directory, add _AR suffix
        output_path = input_path.parent / f"{input_path.stem}_AR{input_path.suffix}"

    print("\n" + "="*60)
    print("  POWERPOINT RTL TRANSLATION PIPELINE")
    print("="*60)
    print(f"Input:  {input_path}")
    print(f"Output: {output_path}")
    print("="*60)

    # Create temp files
    temp_dir = Path(tempfile.gettempdir())
    english_map = temp_dir / f"{input_path.stem}_english.json"
    arabic_map = temp_dir / f"{input_path.stem}_arabic.json"

    try:
        # Step 1: Extract English text
        cmd1 = f'python rtl_pptx_transformer.py dump-map "{input_path}" --out "{english_map}"'
        run_command(cmd1, "STEP 1/3: Extracting English text")

        # Step 2: Auto-translate to Arabic
        cmd2 = f'python auto_translate_map.py --in "{english_map}" --out "{arabic_map}"'
        run_command(cmd2, "STEP 2/3: Translating to Arabic (GPT-4)")

        # Step 3: Apply RTL transformation
        cmd3 = f'''python graph_rtl_pipeline.py \
  --in "{input_path}" \
  --out "{output_path}" \
  --map "{arabic_map}" \
  --mirror \
  --flip-icons \
  --arabic-font "Noto Naskh Arabic" \
  --arabic-digits'''
        run_command(cmd3, "STEP 3/3: Applying RTL transformation")

        # Success!
        print("\n" + "="*60)
        print("  ✓ TRANSLATION COMPLETE!")
        print("="*60)
        print(f"Arabic RTL PowerPoint saved to:")
        print(f"  {output_path}")
        print("="*60)

        # Cleanup temp files (optional)
        # english_map.unlink(missing_ok=True)
        # arabic_map.unlink(missing_ok=True)

    except Exception as e:
        print(f"\n❌ ERROR: {str(e)}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="One-command PowerPoint translation to Arabic RTL",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Translate and save as input_AR.pptx in same directory
  python translate_pptx.py presentation.pptx

  # Specify custom output location
  python translate_pptx.py presentation.pptx --out /path/to/output.pptx

  # With drag & drop (macOS)
  python translate_pptx.py "/Users/name/Desktop/My Presentation.pptx"
        """
    )

    parser.add_argument("input", help="Input English PowerPoint file")
    parser.add_argument("--out", dest="output", help="Output Arabic PowerPoint file (optional)")

    args = parser.parse_args()

    translate_pptx(args.input, args.output)


if __name__ == "__main__":
    main()
