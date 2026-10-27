import assert from "node:assert/strict"
import test from "node:test"

import {
  buildImageArgs,
  imageKind,
  imageOutputFormat,
  validateImageRequest,
} from "../src/commands/convert/image.mjs"

test("image inputs support common ImageMagick extensions", () => {
  assert.equal(imageKind("photo.TIFF"), "image")
  assert.equal(imageKind("icon.ico"), "image")
  assert.equal(imageKind("report.pdf"), "")
  assert.equal(imageKind("clip.mp4"), "")
})

test("image output formats are normalized", () => {
  assert.equal(imageOutputFormat("JPG"), "jpg")
  assert.equal(imageOutputFormat(".webp"), "webp")
  assert.equal(imageOutputFormat("pdf"), "pdf")
  assert.equal(imageOutputFormat("mp4"), "")
})

test("buildImageArgs composes simple edits", () => {
  const args = buildImageArgs({
    input: "/in/photo.png",
    output: "/out/photo.jpg",
    values: {
      resize: "800x600",
      crop: "400x300+10+20",
      rotate: 90,
      flip: "horizontal",
      grayscale: true,
      quality: 85,
      strip: true,
      background: "white",
      autoOrient: true,
      trim: true,
    },
  })
  assert.equal(args[0], "/in/photo.png")
  assert.ok(args.includes("-auto-orient"))
  assert.ok(args.includes("-trim"))
  assert.ok(args.includes("-resize"))
  assert.ok(args.includes("800x600"))
  assert.ok(args.includes("-crop"))
  assert.ok(args.includes("400x300+10+20"))
  assert.ok(args.includes("-rotate"))
  assert.ok(args.includes("90"))
  assert.ok(args.includes("-flop"))
  assert.ok(args.includes("-colorspace"))
  assert.ok(args.includes("Gray"))
  assert.ok(args.includes("-strip"))
  assert.ok(args.includes("-quality"))
  assert.ok(args.includes("85"))
  assert.ok(args.includes("-background"))
  assert.ok(args.includes("white"))
  assert.equal(args.at(-1), "/out/photo.jpg")
})

test("buildImageArgs uses flip for vertical mirroring", () => {
  const args = buildImageArgs({
    input: "/in/a.png",
    output: "/out/a.png",
    values: { flip: "vertical" },
  })
  assert.ok(args.includes("-flip"))
  assert.ok(!args.includes("-flop"))
})

test("validateImageRequest accepts conversions and rejects media flags", () => {
  assert.deepEqual(validateImageRequest({ values: { to: "webp" } }), { format: "webp" })
  assert.throws(() => validateImageRequest({ values: { to: "mp4" } }), /image target/)
  assert.throws(
    () => validateImageRequest({ values: { to: "jpg", frames: 2 } }),
    /not valid for images/,
  )
  assert.throws(() => validateImageRequest({ values: { to: "jpg", scale: "800:600" } }), /WxH/)
})

test("validateImageRequest checks resize, crop, quality, and flip", () => {
  assert.throws(() => validateImageRequest({ values: { to: "jpg", resize: "800" } }), /resize/)
  assert.throws(() => validateImageRequest({ values: { to: "jpg", crop: "10:10:1:1" } }), /crop/)
  assert.throws(() => validateImageRequest({ values: { to: "jpg", quality: 101 } }), /quality/)
  assert.throws(() => validateImageRequest({ values: { to: "jpg", flip: "diagonal" } }), /flip/)
})
