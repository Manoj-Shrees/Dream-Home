Dream Home V11 — Anti-Blur Images, Fast Loading & Photo-Matched 3D Villa Studio
===============================================================================
Highlights:
- Anti-blur & fast-loaded assets: eliminated 4x–5x fake upscaling bloat (21.7 MB -> 7.7 MB main assets + ~20–45 KB responsive WebP thumbnails), re-encoded with cwebp -sharp_yuv, cleanly re-cropped floor plans/elevations/utilities (fixing water.webp text cutoff), and upgraded interior cards to crisp HD architectural renders.
- LCP & CLS optimization: hero image preloaded with srcset/sizes and fetchpriority="high", explicit width/height on every image, native lazy loading below the fold, and content-visibility: auto with GPU pause when off-screen.
- Photo-matched 3D Villa Model: eliminated floor-slab/atrium collisions, sculpted rounded white garage portal with 2 sleek cars, 3 curved cantilevered balconies with glowing gold LED coves & roof cornice, full-height curved glass spiral staircase atrium with continuous helical ribbon + cascading crystal chandelier (no central pole), grand curved entry steps, right 2-story curved pavilion, PMREM reflections, soft shadows, Day/Golden Hour/Night moods and camera presets.
- Website enhancements: Hero Original vs Refined switcher, interactive Before/After comparison slider, structured Construction Timeline & Chitwan 2026 Cost Breakdown, exact room dimensions on floor schematics, and modern native <dialog> lightbox with keyboard navigation.

Run locally:
  python3 -m http.server 8000
Then open http://localhost:8000
