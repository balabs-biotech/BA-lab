# BA Labs — HyperFrames / Field Notes

HyperFrames is the **video-rendering layer**, not a runtime dependency of the public website. The live site uses the BA Labs motion system (Vanta.js, a GLSL shader gradient and Anime.js); HyperFrames turns selected pages, research notes and visual sequences into deterministic MP4 films.

## First composition

The starter composition is `field-notes-60s.html`. Replace the media placeholders with locally stored, cleared BA Labs footage before rendering.

## Local workflow

Requires Node.js 22+ and FFmpeg, as specified by HyperFrames.

```bash
npx hyperframes init
# Place field-notes-60s.html in the initialized project directory.
npx hyperframes preview
npx hyperframes render --output field-notes-60s.mp4
```

## Production rules

- Keep the 60-second sequence in the BA Labs palette: #111B1D, #263B38, #B96B4D, #D1D0C5.
- Use original BA Labs footage first: microscope, culture work, substrate, instrumentation and prototypes.
- No medical claims, invented results, or imagery implying validation that has not happened.
- Use locally stored media for repeatable renders; do not rely on remote hotlinked images.
- The website and the 2D explorer remain independent of the video-rendering pipeline.

References: https://hyperframes.app/docs/1-startup/1-introduction
