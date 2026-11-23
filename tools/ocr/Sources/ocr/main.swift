// OCR a page photo with Apple Vision (the same engine the iPhone/iPad/Mac app will use)
// and print spans as JSON for the server pipeline.
//
//   swift run -c release --package-path tools/ocr ocr path/to/page.jpg > page.ocr.json
//
// Boxes are converted from Vision's bottom-left origin to top-left, matching
// server/src/core/geometry.ts (fromVisionBox) and Anki's image-occlusion format.

import CoreGraphics
import Foundation
import ImageIO
import Vision

struct Box: Codable { let left: Double; let top: Double; let width: Double; let height: Double }
struct Span: Codable { let id: String; let text: String; let box: Box; let confidence: Double }
struct Page: Codable { let image: String; let width: Int; let height: Int; let spans: [Span] }

func fail(_ message: String, code: Int32 = 1) -> Never {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
    exit(code)
}

/// Loads JPEG/PNG/HEIC and applies the photo's EXIF orientation so phone photos are upright.
func loadImage(_ path: String) -> CGImage? {
    let url = URL(fileURLWithPath: path) as CFURL
    guard let source = CGImageSourceCreateWithURL(url, nil) else { return nil }
    let options: [CFString: Any] = [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: 4096,
    ]
    return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
}

let args = CommandLine.arguments
guard args.count >= 2 else { fail("usage: ocr <image> [--lang en-US]", code: 2) }
let path = args[1]
var languages = ["en-US"]
if let i = args.firstIndex(of: "--lang"), i + 1 < args.count { languages = [args[i + 1]] }

guard let image = loadImage(path) else { fail("Could not read image: \(path)") }

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

struct Found { let text: String; let box: Box; let confidence: Double }
var found: [Found] = []
for observation in request.results ?? [] {
    guard let candidate = observation.topCandidates(1).first else { continue }
    let b = observation.boundingBox
    let box = Box(
        left: Double(b.minX),
        top: Double(1 - b.minY - b.height),
        width: Double(b.width),
        height: Double(b.height)
    )
    found.append(Found(text: candidate.string, box: box, confidence: Double(candidate.confidence)))
}

// Reading order: top to bottom, then left to right (rows within ~1% of page height count as one line).
found.sort { a, b in
    abs(a.box.top - b.box.top) < 0.01 ? a.box.left < b.box.left : a.box.top < b.box.top
}

let spans = found.enumerated().map { i, f in
    Span(id: "s\(i + 1)", text: f.text, box: f.box, confidence: f.confidence)
}
let page = Page(image: (path as NSString).lastPathComponent, width: image.width, height: image.height, spans: spans)

let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
guard let data = try? encoder.encode(page) else { fail("Could not encode JSON") }
FileHandle.standardOutput.write(data)
FileHandle.standardOutput.write("\n".data(using: .utf8)!)
