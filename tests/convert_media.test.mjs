import assert from "node:assert/strict"
import test from "node:test"

import {
  buildFrameArgs,
  buildMediaArgs,
  frameDir,
  hasMediaOptions,
  mediaKind,
  mediaOutputKind,
  parseTime,
  sampleTimestamps,
} from "../src/commands/convert/media.mjs"
import { validateMediaRequest } from "../src/commands/convert/media-validate.mjs"

test("parseTime accepts seconds and clock values", () => {
  assert.equal(parseTime("90"), 90)
  assert.equal(parseTime("1:30"), 90)
  assert.equal(parseTime("01:02:03.5"), 3723.5)
  assert.throws(() => parseTime("later"), /invalid time/)
})

test("sampleTimestamps samples the requested range", () => {
  assert.deepEqual(sampleTimestamps(0, 10, 5), [1, 3, 5, 7, 9])
  assert.deepEqual(sampleTimestamps(4, 6, 2), [4.5, 5.5])
  assert.deepEqual(sampleTimestamps(0, 0, 1), [0])
})

test("media kinds are detected by extension", () => {
  assert.equal(mediaKind("clip.MP4"), "video")
  assert.equal(mediaKind("song.flac"), "audio")
  assert.equal(mediaKind("photo.png"), "image")
  assert.equal(mediaKind("report.docx"), "")
  assert.equal(mediaOutputKind("gif"), "image")
  assert.equal(mediaOutputKind("mp3"), "audio")
  assert.equal(mediaOutputKind("mp4"), "video")
  assert.equal(mediaOutputKind("pdf"), "")
  assert.equal(hasMediaOptions({ frames: 2 }), true)
  assert.equal(hasMediaOptions({ volume: 2 }), true)
  assert.equal(hasMediaOptions({ to: "pdf" }), false)
})

test("buildMediaArgs trims and edits video", () => {
  const args = buildMediaArgs({
    input: "/in/clip.mov",
    output: "/out/clip.mp4",
    inputKind: "video",
    outputKind: "video",
    values: {
      start: "00:00:10",
      duration: "5",
      scale: "1280:-2",
      fps: "30",
      mute: true,
      codec: "libx264",
      crf: 23,
      preset: "medium",
    },
  })
  assert.deepEqual(args.slice(0, 5), ["-hide_banner", "-loglevel", "error", "-n", "-ss"])
  assert.ok(args.includes("-ss"))
  assert.ok(args.includes("00:00:10"))
  assert.ok(args.includes("-t"))
  assert.ok(args.includes("5"))
  assert.ok(args.includes("-vf"))
  assert.ok(args.includes("scale=1280:-2,fps=30"))
  assert.ok(args.includes("-an"))
  assert.ok(args.includes("-c:v"))
  assert.ok(args.includes("libx264"))
  assert.ok(args.includes("-crf"))
  assert.ok(args.includes("23"))
  assert.equal(args.at(-1), "/out/clip.mp4")
})

test("buildMediaArgs extracts and edits audio", () => {
  const args = buildMediaArgs({
    input: "/in/clip.mp4",
    output: "/out/clip.mp3",
    inputKind: "video",
    outputKind: "audio",
    values: {
      start: "2",
      end: "7",
      volume: "1.5",
      normalize: true,
      audioCodec: "libmp3lame",
      bitrate: "192k",
    },
  })
  assert.ok(args.includes("-vn"))
  assert.ok(args.includes("-af"))
  assert.ok(args.includes("volume=1.5,loudnorm=I=-16:TP=-1.5:LRA=11"))
  assert.ok(args.includes("-c:a"))
  assert.ok(args.includes("libmp3lame"))
  assert.ok(args.includes("-b:a"))
  assert.ok(args.includes("192k"))
  assert.ok(!args.includes("-c:v"))
  assert.ok(args.includes("-t"))
  assert.ok(args.includes("5"))
})

test("buildMediaArgs handles crop, rotation, and GIF output", () => {
  const args = buildMediaArgs({
    input: "/in/clip.mp4",
    output: "/out/clip.gif",
    inputKind: "video",
    outputKind: "image",
    values: {
      crop: "640:480:10:20",
      rotate: 90,
      fps: 12,
      scale: "640:-1",
    },
  })
  assert.ok(args.includes("-vf"))
  assert.ok(args.includes("scale=640:-1,crop=640:480:10:20,transpose=1,fps=12"))
  assert.ok(args.includes("-an"))
  assert.ok(args.includes("-loop"))
  assert.ok(args.includes("0"))
  assert.equal(args.at(-1), "/out/clip.gif")
})

test("validateMediaRequest allows GIF conversion but rejects audio filters", () => {
  assert.deepEqual(
    validateMediaRequest({
      inputKind: "video",
      outputKind: "image",
      values: { to: "gif" },
    }),
    { mode: "convert" },
  )
  assert.throws(
    () =>
      validateMediaRequest({
        inputKind: "video",
        outputKind: "audio",
        values: { to: "mp3", scale: "640:-2" },
      }),
    /not valid for audio output/,
  )
})

test("validateMediaRequest keeps frame extraction video-only", () => {
  assert.throws(
    () =>
      validateMediaRequest({
        inputKind: "audio",
        outputKind: "image",
        values: { frames: 2 },
      }),
    /requires a video/,
  )
})

test("buildMediaArgs rejects conflicting trim flags", () => {
  assert.throws(
    () =>
      buildMediaArgs({
        input: "/in/a.mp4",
        output: "/out/a.mp4",
        inputKind: "video",
        outputKind: "video",
        values: { start: "1", end: "5", duration: "2" },
      }),
    /end.*duration/i,
  )
})

test("buildFrameArgs extracts one frame without overwriting", () => {
  const args = buildFrameArgs({
    input: "/in/clip.mp4",
    output: "/out/frame-001.jpg",
    timestamp: 12.5,
  })
  assert.deepEqual(args.slice(0, 6), ["-hide_banner", "-loglevel", "error", "-n", "-ss", "12.5"])
  assert.ok(args.includes("-frames:v"))
  assert.ok(args.includes("1"))
  assert.equal(args.at(-1), "/out/frame-001.jpg")
})

test("frameDir keeps frames separate from the source file", () => {
  assert.equal(frameDir("/in/clip.mp4", "/out"), "/out/clip-frames")
})
