#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Automatic Translation Map Generator using GPT-4

This script takes an English translation map JSON and automatically translates
all text to Arabic using OpenAI's GPT-4 API.

Usage:
    python auto_translate_map.py --in english_map.json --out arabic_map.json --target-lang ar

Environment Variables:
    OPENAI_API_KEY - Your OpenAI API key
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Dict
from openai import OpenAI
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


def translate_single(client: OpenAI, text: str, target_lang: str = "ar") -> str:
    """
    Translate a single text using GPT-4.

    Args:
        client: OpenAI client
        text: English text to translate
        target_lang: Target language code (default: "ar" for Arabic)

    Returns:
        Translated text
    """
    if not text or not text.strip():
        return ""

    lang_name = "Arabic" if target_lang == "ar" else target_lang

    # Call GPT-4 with a simple, direct prompt
    response = client.chat.completions.create(
        model="gpt-4o-mini",  # Cheaper and faster than gpt-4
        messages=[
            {
                "role": "system",
                "content": f"You are a professional translator. Translate the following English text to {lang_name}. Return ONLY the translation, no explanations."
            },
            {
                "role": "user",
                "content": text
            }
        ],
        max_tokens=500,
        temperature=0.3  # Lower temperature for more consistent translations
    )

    return response.choices[0].message.content.strip()


def auto_translate_map(input_map: str, output_map: str, target_lang: str = "ar"):
    """
    Automatically translate an entire translation map.

    Args:
        input_map: Path to input English JSON map
        output_map: Path to output translated JSON map
        target_lang: Target language code
        batch_size: Number of items to translate per API call
    """
    # Check for API key
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("ERROR: OPENAI_API_KEY environment variable not set!")
        print("Please set it in your .env file or export it:")
        print("  export OPENAI_API_KEY='your-key-here'")
        sys.exit(1)

    client = OpenAI(api_key=api_key)

    # Load input map
    print(f"Loading translation map from: {input_map}")
    with open(input_map, 'r', encoding='utf-8') as f:
        english_map = json.load(f)

    total_items = len(english_map)
    print(f"Found {total_items} items to translate")

    # Filter out empty values
    items_to_translate = {k: v for k, v in english_map.items() if v and v.strip()}
    print(f"Translating {len(items_to_translate)} non-empty items...")

    # Translate items individually for 100% accuracy
    translated_map = {}
    keys = list(items_to_translate.keys())

    for i, key in enumerate(keys, 1):
        text = items_to_translate[key]

        # Show progress every 10 items
        if i % 10 == 0 or i == 1:
            print(f"Translating... {i}/{len(keys)} ({i/len(keys)*100:.0f}%)")

        try:
            translation = translate_single(client, text, target_lang)
            if translation:
                translated_map[key] = translation
            else:
                print(f"  ⚠️  Empty translation for: {key[:50]}")
        except Exception as e:
            print(f"  ✗ Error translating {key}: {str(e)[:100]}")
            continue

    # Add back empty values from original map
    for key, value in english_map.items():
        if not value or not value.strip():
            translated_map[key] = ""

    # Save translated map
    print(f"\nSaving translated map to: {output_map}")
    with open(output_map, 'w', encoding='utf-8') as f:
        json.dump(translated_map, f, ensure_ascii=False, indent=2)

    print(f"\n✓ Translation complete!")
    print(f"  Total items: {total_items}")
    print(f"  Translated: {len(translated_map)}")
    print(f"  Coverage: {len(translated_map)/total_items*100:.1f}%")


def main():
    parser = argparse.ArgumentParser(
        description="Automatically translate PowerPoint translation map using GPT-4"
    )
    parser.add_argument("--in", dest="input_map", required=True,
                        help="Input English translation map JSON")
    parser.add_argument("--out", dest="output_map", required=True,
                        help="Output translated map JSON")
    parser.add_argument("--target-lang", dest="target_lang", default="ar",
                        help="Target language code (default: ar for Arabic)")

    args = parser.parse_args()

    auto_translate_map(
        input_map=args.input_map,
        output_map=args.output_map,
        target_lang=args.target_lang
    )


if __name__ == "__main__":
    main()
