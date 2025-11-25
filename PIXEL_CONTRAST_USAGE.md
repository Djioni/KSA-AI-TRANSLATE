# Pixel Contrast Agent Usage Guide

## Quick Start

The pixel contrast agent replaces OCR-based validation with deterministic pixel-level contrast measurement.

## Standalone CLI Usage

### Basic Usage

```bash
source .venv/bin/activate

python pixel_contrast_agent.py \
  --in input_AR.pptx \
  --out output_polished.pptx \
  --brand-dark "#0D2A47" \
  --brand-light "#FFFFFF" \
  --min-contrast 4.5 \
  --audit-out audit.json
```

### All Parameters

```bash
python pixel_contrast_agent.py \
  --in slides_AR.pptx              # Input PPTX (after RTL transform)
  --out slides_polished.pptx       # Output PPTX
  --brand-dark "#0D2A47"           # Hex RGB for dark brand color
  --brand-light "#FFFFFF"          # Hex RGB for light brand color
  --min-contrast 4.5               # Minimum WCAG contrast ratio (4.5 for AA, 7.0 for AAA)
  --dpi 300                        # Render DPI (240-300 recommended, higher = slower but more accurate)
  --pad 6                          # Padding (pixels) around shape bbox for sampling
  --audit-out audit_pixel.json     # Output audit JSON with measurements
```

### Parameter Details

**--brand-dark** (default: `#0D2A47`)
- Dark color to use when background is light
- Should be from your brand palette
- Used when it provides better contrast than brand-light

**--brand-light** (default: `#FFFFFF`)
- Light color to use when background is dark
- Typically white or a light neutral
- Used when it provides better contrast than brand-dark

**--min-contrast** (default: `4.5`)
- WCAG AA standard for normal text is 4.5:1
- WCAG AA standard for large text is 3:1
- WCAG AAA standard for normal text is 7:1
- If a shape's contrast is below this, it will be fixed

**--dpi** (default: `300`)
- Resolution for rendering slides to pixels
- Higher = more accurate but slower
- 240-300 is recommended for most slides
- 150-200 for faster processing at cost of accuracy

**--pad** (default: `6`)
- Pixels to sample around each shape's bounding box
- Helps capture background in case shape bbox is tight
- Increase if background detection is inaccurate

## Via API (Orchestrator)

The pixel contrast agent is now the default for Agent D. Simply submit jobs as usual:

```bash
# Example: Submit a job with custom contrast settings
curl -X POST http://localhost:3000/submit \
  -F 'pptx=@presentation.pptx' \
  -F 'map=@translations.json' \
  -F 'brandDark=#0D2A47' \
  -F 'brandLight=#FFFFFF' \
  -F 'minContrast=4.5'

# Response:
{
  "ok": true,
  "jobId": "abc123xyz",
  "status": "queued",
  "checkStatus": "/status/abc123xyz",
  "download": "/download/abc123xyz"
}

# Check status
curl http://localhost:3000/status/abc123xyz

# Download reports (includes pixel contrast audit)
curl http://localhost:3000/reports/abc123xyz
```

The reports endpoint will now return:
```json
{
  "ok": true,
  "jobId": "abc123xyz",
  "reports": {
    "pixelContrast": [
      {
        "slide": 1,
        "shape_id": 30,
        "name": "Rectangle: Rounded Corners 29",
        "bbox_px": [1106, 1418, 3881, 1737],
        "measured_fg": [0, 115, 175],
        "measured_bg": [234, 239, 241],
        "ratio_before": 4.449,
        "ratio_after": 12.586,
        "fixed": true,
        "applied_color": [13, 42, 71],
        "note": ""
      }
    ],
    "vision": { /* ... if Agent V ran ... */ }
  }
}
```

## Understanding the Audit Output

The audit JSON contains one entry per text shape, showing:

### Example Audit Entry

```json
{
  "slide": 1,                           // Slide number (1-indexed)
  "shape_id": 31,                       // Shape ID from PPTX
  "name": "Rectangle: Rounded Corners", // Shape name
  "bbox_px": [1106, 1778, 3881, 2097],  // Pixel bounding box [x1, y1, x2, y2]
  "measured_fg": [25, 176, 198],        // Measured foreground RGB (from pixels or runs)
  "measured_bg": [234, 239, 241],       // Measured background RGB (from Otsu segmentation)
  "ratio_before": 2.246,                // Contrast ratio BEFORE fix (< min threshold)
  "ratio_after": 12.586,                // Contrast ratio AFTER fix (meets threshold)
  "fixed": true,                        // Whether color was changed
  "applied_color": [13, 42, 71],        // RGB color applied (brand-dark in this case)
  "note": ""                            // Additional notes (e.g., "used BW fallback")
}
```

### Interpreting Results

**fixed: false**
- Shape already had sufficient contrast
- No changes made
- `ratio_before` equals `ratio_after`

**fixed: true, applied_color = brand-dark or brand-light**
- Shape had low contrast
- Applied the brand color with better contrast against background
- Check `ratio_after` to verify it meets your threshold

**note: "used BW fallback"**
- Neither brand color provided sufficient contrast
- Fell back to pure black (0,0,0) or white (255,255,255)
- Consider adjusting your brand colors or the background

## Common Scenarios

### Scenario 1: Light Text on Light Gray Background

**Problem**: Low contrast (e.g., ratio 2.2)

**Detection**:
```json
{
  "measured_fg": [220, 220, 220],  // Light gray text
  "measured_bg": [245, 245, 245],  // Almost white background
  "ratio_before": 1.18
}
```

**Fix**: Apply brand-dark
```json
{
  "applied_color": [13, 42, 71],   // Dark blue brand color
  "ratio_after": 15.3,
  "fixed": true
}
```

### Scenario 2: Dark Text on Dark Background

**Problem**: Dark blue on dark gray

**Detection**:
```json
{
  "measured_fg": [13, 42, 71],     // Dark brand color
  "measured_bg": [50, 50, 50],     // Dark gray
  "ratio_before": 3.2
}
```

**Fix**: Apply brand-light
```json
{
  "applied_color": [255, 255, 255], // White
  "ratio_after": 11.8,
  "fixed": true
}
```

### Scenario 3: Gradient Background

**Problem**: XML says white background, but rendered pixels show gradient

**How pixel agent handles it**:
1. Renders slide to pixels at 300 DPI
2. Samples the actual rendered region around the text shape
3. Uses Otsu threshold to separate text from background
4. Measures the **actual** background color from pixels, not XML
5. Applies fix based on real rendered appearance

This is why pixel-based measurement is superior to XML-based contrast checks.

## Troubleshooting

### Issue: "LibreOffice not found"

**Solution**:
```bash
brew install --cask libreoffice
```

### Issue: All shapes marked as "fixed" when they look fine

**Cause**: `--min-contrast` threshold too high

**Solution**: Lower the threshold (e.g., from 7.0 to 4.5)

### Issue: Some shapes still have low contrast

**Cause**: Background detection failed (gradient, image, complex fill)

**Debug**:
1. Check the `measured_bg` in audit JSON
2. If it's wrong, increase `--pad` to sample more background pixels
3. If still wrong, the background may be too complex (image/texture)

**Workaround**: The agent will fall back to black/white if brand colors don't work

### Issue: Processing very slow

**Cause**: High DPI rendering

**Solution**:
- Reduce `--dpi` from 300 to 240 or 200
- Trade-off: Slightly less accurate background detection
- For most slides, 240 DPI is sufficient

### Issue: Text color changed when it shouldn't have

**Cause**: Shape has a gradient/image background that OCR would also fail on

**Solution**:
1. Check `ratio_before` in audit - was it actually below threshold?
2. If yes, the fix was correct (human perception can be deceived)
3. If no, file a bug with the audit JSON and screenshot

## Comparison: OCR vs Pixel Contrast

| Aspect | OCR (Old) | Pixel Contrast (New) |
|--------|-----------|---------------------|
| **Speed** | Slow (~10-30s per slide) | Fast (~2-5s per slide) |
| **Accuracy for Arabic** | Poor (50-70% confidence) | Excellent (deterministic) |
| **Gradient backgrounds** | Fails | Handles correctly |
| **Deterministic** | ❌ No | ✅ Yes |
| **WCAG compliant** | ❌ Indirect | ✅ Direct measurement |
| **Dependencies** | Tesseract + language data | NumPy, Pillow (lighter) |
| **Output** | Text + confidence % | Contrast ratios + colors |
| **Debugging** | Difficult | Easy (audit shows all measurements) |

## Best Practices

1. **Always generate audit JSON** - It's invaluable for debugging
2. **Use brand colors** - Don't rely on black/white fallback
3. **Test with gradients** - Pixel method excels here
4. **Set appropriate threshold** - 4.5 for AA compliance, 7.0 for AAA
5. **Review audit for patterns** - If many shapes need fixing, consider redesigning the template
6. **Keep DPI at 300** - Unless you need faster processing
7. **Pair with Vision QA** - Use Agent V for final visual sanity check

## Next Steps

After running the pixel contrast agent, optionally run Vision QA (Agent V) for a final visual check using a VLM (Vision Language Model). This is non-blocking and provides additional confidence for critical presentations.

---

**Need Help?**

- Check audit JSON for detailed measurements
- Review `IMPROVE-THE-OCR.md` for the original analysis
- See `OCR_IMPROVEMENT_SUMMARY.md` for implementation details
