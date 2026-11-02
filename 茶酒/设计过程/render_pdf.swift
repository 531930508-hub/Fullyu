import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
if args.count != 4 {
    fputs("Usage: render_pdf input.pdf output.png dpi\n", stderr)
    exit(1)
}
let input = URL(fileURLWithPath: args[1])
let output = URL(fileURLWithPath: args[2])
let dpi = Double(args[3])!
guard let document = CGPDFDocument(input as CFURL), let page = document.page(at: 1) else {
    fatalError("Unable to read PDF")
}
let box = page.getBoxRect(.mediaBox)
let width = Int((box.width * dpi / 72).rounded())
let height = Int((box.height * dpi / 72).rounded())
let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
guard let context = CGContext(data: nil, width: width, height: height,
                              bitsPerComponent: 8, bytesPerRow: 0, space: colorSpace,
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
    fatalError("Unable to create bitmap context")
}
context.setFillColor(CGColor(gray: 1, alpha: 1))
context.fill(CGRect(x: 0, y: 0, width: width, height: height))
context.setAllowsAntialiasing(true)
context.setShouldAntialias(true)
context.interpolationQuality = .high
context.scaleBy(x: CGFloat(width) / box.width, y: CGFloat(height) / box.height)
context.translateBy(x: -box.minX, y: -box.minY)
context.drawPDFPage(page)
guard let image = context.makeImage(),
      let destination = CGImageDestinationCreateWithURL(output as CFURL, UTType.png.identifier as CFString, 1, nil) else {
    fatalError("Unable to save PNG")
}
let properties: [CFString: Any] = [kCGImagePropertyDPIWidth: dpi, kCGImagePropertyDPIHeight: dpi]
CGImageDestinationAddImage(destination, image, properties as CFDictionary)
if !CGImageDestinationFinalize(destination) { fatalError("PNG finalization failed") }
print("Rendered \(width) x \(height) at \(dpi) dpi: \(output.path)")
