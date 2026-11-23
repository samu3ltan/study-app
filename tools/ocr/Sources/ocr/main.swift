// OCR a page photo with Apple Vision (the same engine the iPhone/iPad/Mac app will use)
// and print spans as JSON for the server pipeline.
//
//   swift build -c release --package-path tools/ocr
//   tools/ocr/.build/release/ocr page.png --small page.small.jpg > page.ocr.json
//
// Boxes are converted from Vision's bottom-left origin to top-left, matching
// server/src/core/geometry.ts (fromVisionBox) and Anki's image-occlusion format.
// Each line span also lists its words with their own boxes, so a mask can cover
// part of a line (e.g. "M1" in "M1 Left marginal").
// --small writes a downscaled JPEG (max 1600 px) for sending to the AI step.

import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers
import Vision

struct Box: Codable { let left: Double; let top: Double; let width: Double; let height: Double }
struct Word: Codable { let id: String; let text: String; let box: Box }
struct Span: Codable { let id: String; let text: String; let box: Box; let confidence: Double; let words: [Word] }
struct Page: Codable { let image: String; let width: Int; let height: Int; let spans: [Span] }

func fail(_ message: String, code: Int32 = 1) -> Never {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
    exit(code)
}

/// Loads JPEG/PNG/HEIC and applies the photo's EXIF orientation so phone photos are upright.
func loadImage(_ path: String, maxPixels: Int) -> CGImage? {
    let url = URL(fileURLWithPath: path) as CFURL
    guard let source = CGImageSourceCreateWithURL(url, nil) else { return nil }
    let options: [CFString: Any] = [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: maxPixels,
    ]
    return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
}

func writeJPEG(_ image: CGImage, to path: String) -> Bool {
    let url = URL(fileURLWithPath: path) as CFURL
    guard let dest = CGImageDestinationCreateWithURL(url, UTType.jpeg.identifier as CFString, 1, nil) else { return false }
    CGImageDestinationAddImage(dest, image, [kCGImageDestinationLossyCompressionQuality: 0.85] as CFDictionary)
    return CGImageDestinationFinalize(dest)
}

func topLeft(_ b: CGRect) -> Box {
    Box(left: Double(b.minX), top: Double(1 - b.minY - b.height), width: Double(b.width), height: Double(b.height))
}

let args = CommandLine.arguments
guard args.count >= 2 else { fail("usage: ocr <image> [--small out.jpg] [--lang en-US]", code: 2) }
let path = args[1]
var languages = ["en-US"]
if let i = args.firstIndex(of: "--lang"), i + 1 < args.count { languages = [args[i + 1]] }
var smallPath: String? = nil
if let i = args.firstIndex(of: "--small"), i + 1 < args.count { smallPath = args[i + 1] }

guard let image = loadImage(path, maxPixels: 4096) else { fail("Could not read image: \(path)") }
if let smallPath {
    guard let small = loadImage(path, maxPixels: 1600), writeJPEG(small, to: smallPath) else {
        fail("Could not write small image to \(smallPath)")
    }
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
// Off on purpose: dictionary "correction" rewrites technical terms (drug names, anatomy, chemistry).
request.usesLanguageCorrection = false
request.recognitionLanguages = languages

do {
    try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
} catch {
    fail("Vision failed: \(error.localizedDescription)")
}

struct FoundWord { let text: String; let box: Box }
struct Found { let text: String; let box: Box; let confidence: Double; let words: [FoundWord] }
var found: [Found] = []
for observation in request.results ?? [] {
    guard let candidate = observation.topCandidates(1).first else { continue }
    let text = candidate.string
    var words: [FoundWord] = []
    // Split on whitespace (keeps tokens like "(LAD)" or "artery," intact).
    for range in text.ranges(of: #/\S+/#) {
        guard let rect = try? candidate.boundingBox(for: range)?.boundingBox else { continue }
        words.append(FoundWord(text: String(text[range]), box: topLeft(rect)))
    }
    found.append(Found(text: text, box: topLeft(observation.boundingBox), confidence: Double(candidate.confidence), words: words))
}

// Reading order: top to bottom, then left to right (rows within ~1% of page height count as one line).
found.sort { a, b in
    abs(a.box.top - b.box.top) < 0.01 ? a.box.left < b.box.left : a.box.top < b.box.top
}

let spans = found.enumerated().map { i, f -> Span in
    let sid = "s\(i + 1)"
    let words = f.words.enumerated().map { j, w in Word(id: "\(sid).w\(j + 1)", text: w.text, box: w.box) }
    return Span(id: sid, text: f.text, box: f.box, confidence: f.confidence, words: words)
}
let page = Page(image: (path as NSString).lastPathComponent, width: image.width, height: image.height, spans: spans)

let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
guard let data = try? encoder.encode(page) else { fail("Could not encode JSON") }
FileHandle.standardOutput.write(data)
FileHandle.standardOutput.write("\n".data(using: .utf8)!)
