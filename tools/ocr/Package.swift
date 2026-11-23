// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "ocr",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(name: "ocr", path: "Sources/ocr")
    ]
)
