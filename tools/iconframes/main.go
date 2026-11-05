// Command iconframes builds the Windows .ico from the square app icon source.
//
// The full artwork turns into mush once it is scaled down to 16 or 24 pixels,
// so those two frames are drawn from simplified geometry instead: a jade disc
// with a pearl core, plus one energy arc at 24px. Larger frames are an area
// averaged downscale of the source, which keeps the spiral intact.
package main

import (
	"bytes"
	"encoding/binary"
	"flag"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"math"
	"os"
)

// Drawing geometry, expressed as a fraction of the frame width and shared by
// every simplified size. The disc is deliberately larger than in the full
// artwork so it still reads at 16px.
const (
	tileRadius    = 0.222
	discRadius    = 0.310
	coreRadius    = 0.075
	arcRadius     = 0.185
	arcWidth      = 0.062
	arcStart      = 40.0
	arcEnd        = 280.0
	superSampling = 8
)

var (
	tileTop    = color.NRGBA{R: 12, G: 36, B: 25, A: 255}
	tileBottom = color.NRGBA{R: 3, G: 14, B: 10, A: 255}
	discTop    = color.NRGBA{R: 69, G: 232, B: 176, A: 255}
	discBottom = color.NRGBA{R: 8, G: 153, B: 108, A: 255}
	pearl      = color.NRGBA{R: 242, G: 255, B: 250, A: 255}
)

func main() {
	input := flag.String("input", "appicon.png", "square source icon")
	output := flag.String("out", "windows/icon.ico", "icon file to write")
	flag.Parse()

	f, err := os.Open(*input)
	if err != nil {
		fail(err)
	}
	src, err := png.Decode(f)
	f.Close()
	if err != nil {
		fail(err)
	}
	source := toNRGBA(src)
	if b := source.Bounds(); b.Dx() != b.Dy() {
		fail(fmt.Errorf("%s is %dx%d, want a square", *input, b.Dx(), b.Dy()))
	}

	frames := []*image.NRGBA{
		simplified(16, false),
		simplified(24, true),
		resizeArea(source, 32, 32),
		resizeArea(source, 48, 48),
		resizeArea(source, 64, 64),
		resizeArea(source, 128, 128),
		resizeArea(source, 256, 256),
	}
	if err := writeICO(*output, frames); err != nil {
		fail(err)
	}
	fmt.Printf("iconframes: wrote %s with frames 16 24 32 48 64 128 256\n", *output)
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "iconframes:", err)
	os.Exit(1)
}

func toNRGBA(src image.Image) *image.NRGBA {
	b := src.Bounds()
	dst := image.NewNRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	draw.Draw(dst, dst.Bounds(), src, b.Min, draw.Src)
	return dst
}

// simplified draws the mark at size using hard edges at a supersampled
// resolution; resizeArea then provides the antialiasing.
func simplified(size int, withArc bool) *image.NRGBA {
	s := size * superSampling
	big := image.NewNRGBA(image.Rect(0, 0, s, s))
	c := float64(s) / 2

	discR := discRadius * float64(s)
	coreR := coreRadius * float64(s)
	arcR := arcRadius * float64(s)
	arcHalf := arcWidth * float64(s) / 2

	for y := 0; y < s; y++ {
		fy := float64(y) + 0.5
		for x := 0; x < s; x++ {
			fx := float64(x) + 0.5
			if !inRoundedSquare(fx-c, fy-c, c, tileRadius*float64(s)) {
				continue
			}
			col := blend(tileTop, tileBottom, fy/float64(s))

			d := math.Hypot(fx-c, fy-c)
			if d <= discR {
				col = blend(discTop, discBottom, fy/float64(s))
			}
			if withArc && d >= arcR-arcHalf && d <= arcR+arcHalf && inArc(fx-c, fy-c) {
				col = pearl
			}
			if d <= coreR {
				col = pearl
			}
			big.SetNRGBA(x, y, col)
		}
	}
	return resizeArea(big, size, size)
}

func inRoundedSquare(dx, dy, half, radius float64) bool {
	x := math.Abs(dx) - (half - radius)
	y := math.Abs(dy) - (half - radius)
	if x < 0 {
		x = 0
	}
	if y < 0 {
		y = 0
	}
	return math.Hypot(x, y) <= radius
}

func inArc(dx, dy float64) bool {
	deg := math.Atan2(dy, dx) * 180 / math.Pi
	if deg < 0 {
		deg += 360
	}
	return deg >= arcStart && deg <= arcEnd
}

func blend(from, to color.NRGBA, t float64) color.NRGBA {
	if t < 0 {
		t = 0
	}
	if t > 1 {
		t = 1
	}
	mix := func(a, b uint8) uint8 {
		return uint8(math.Round(float64(a) + (float64(b)-float64(a))*t))
	}
	return color.NRGBA{R: mix(from.R, to.R), G: mix(from.G, to.G), B: mix(from.B, to.B), A: 255}
}

// resizeArea scales with an exact area average, which is what small icon
// frames need: no ringing, no dropped pixels.
func resizeArea(src *image.NRGBA, w, h int) *image.NRGBA {
	sw, sh := src.Bounds().Dx(), src.Bounds().Dy()
	if sw == w && sh == h {
		return src
	}
	horizontal := resample(srcPixels(src), sw, sh, w, true)
	vertical := resample(horizontal, w, sh, h, false)
	return toImage(vertical, w, h)
}

// srcPixels returns premultiplied RGBA floats so averaging does not bleed
// transparent pixels into opaque ones.
func srcPixels(src *image.NRGBA) []float32 {
	w, h := src.Bounds().Dx(), src.Bounds().Dy()
	out := make([]float32, w*h*4)
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			r, g, b, a := src.At(x, y).RGBA()
			i := (y*w + x) * 4
			out[i+0] = float32(r) / 65535
			out[i+1] = float32(g) / 65535
			out[i+2] = float32(b) / 65535
			out[i+3] = float32(a) / 65535
		}
	}
	return out
}

func toImage(src []float32, w, h int) *image.NRGBA {
	dst := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			i := (y*w + x) * 4
			a := src[i+3]
			if a <= 0 {
				continue
			}
			dst.SetNRGBA(x, y, color.NRGBA{
				R: clamp8(src[i+0] / a),
				G: clamp8(src[i+1] / a),
				B: clamp8(src[i+2] / a),
				A: clamp8(a),
			})
		}
	}
	return dst
}

func clamp8(v float32) uint8 {
	if v <= 0 {
		return 0
	}
	if v >= 1 {
		return 255
	}
	return uint8(math.Round(float64(v) * 255))
}

// resample runs one axis of the area average. horizontal means the input is
// w wide and dst is dstWidth wide; otherwise the input is h tall.
func resample(src []float32, w, h, dstLen int, horizontal bool) []float32 {
	srcLen, lines := w, h
	if !horizontal {
		srcLen, lines = h, w
	}
	out := make([]float32, func() int {
		if horizontal {
			return dstLen * h * 4
		}
		return w * dstLen * 4
	}())
	scale := float64(srcLen) / float64(dstLen)

	for d := 0; d < dstLen; d++ {
		from := float64(d) * scale
		to := from + scale
		first := int(math.Floor(from))
		last := int(math.Ceil(to))
		if first < 0 {
			first = 0
		}
		if last > srcLen {
			last = srcLen
		}
		for line := 0; line < lines; line++ {
			var acc [4]float64
			var total float64
			for i := first; i < last; i++ {
				cover := math.Min(to, float64(i+1)) - math.Max(from, float64(i))
				if cover <= 0 {
					continue
				}
				var base int
				if horizontal {
					base = (line*w + i) * 4
				} else {
					base = (i*w + line) * 4
				}
				for k := 0; k < 4; k++ {
					acc[k] += float64(src[base+k]) * cover
				}
				total += cover
			}
			var dstBase int
			if horizontal {
				dstBase = (line*dstLen + d) * 4
			} else {
				dstBase = (d*w + line) * 4
			}
			if total > 0 {
				for k := 0; k < 4; k++ {
					out[dstBase+k] = float32(acc[k] / total)
				}
			}
		}
	}
	return out
}

func writeICO(path string, frames []*image.NRGBA) error {
	type encoded struct {
		size int
		data []byte
	}
	parts := make([]encoded, 0, len(frames))
	for _, f := range frames {
		w := f.Bounds().Dx()
		var data []byte
		var err error
		if w >= 256 {
			var buf bytes.Buffer
			if err = png.Encode(&buf, f); err == nil {
				data = buf.Bytes()
			}
		} else {
			data = encodeDIB(f)
		}
		if err != nil {
			return err
		}
		parts = append(parts, encoded{size: w, data: data})
	}

	var out bytes.Buffer
	binary.Write(&out, binary.LittleEndian, uint16(0)) // reserved
	binary.Write(&out, binary.LittleEndian, uint16(1)) // icon
	binary.Write(&out, binary.LittleEndian, uint16(len(parts)))

	offset := 6 + 16*len(parts)
	for _, p := range parts {
		dim := byte(p.size)
		if p.size >= 256 {
			dim = 0
		}
		out.Write([]byte{dim, dim, 0, 0})
		binary.Write(&out, binary.LittleEndian, uint16(1))  // planes
		binary.Write(&out, binary.LittleEndian, uint16(32)) // bits per pixel
		binary.Write(&out, binary.LittleEndian, uint32(len(p.data)))
		binary.Write(&out, binary.LittleEndian, uint32(offset))
		offset += len(p.data)
	}
	for _, p := range parts {
		out.Write(p.data)
	}
	return os.WriteFile(path, out.Bytes(), 0o644)
}

// encodeDIB writes a 32bpp bottom-up bitmap with the 1bpp transparency mask
// that every Windows icon consumer understands.
func encodeDIB(img *image.NRGBA) []byte {
	w, h := img.Bounds().Dx(), img.Bounds().Dy()
	pixels := make([]byte, w*h*4)
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			c := img.NRGBAAt(x, y)
			i := ((h-1-y)*w + x) * 4
			pixels[i+0] = c.B
			pixels[i+1] = c.G
			pixels[i+2] = c.R
			pixels[i+3] = c.A
		}
	}

	maskStride := ((w + 31) / 32) * 4
	mask := make([]byte, maskStride*h)
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			if img.NRGBAAt(x, y).A == 0 {
				mask[y*maskStride+x/8] |= 0x80 >> (x % 8)
			}
		}
	}

	header := make([]byte, 40)
	binary.LittleEndian.PutUint32(header[0:], 40)
	binary.LittleEndian.PutUint32(header[4:], uint32(w))
	binary.LittleEndian.PutUint32(header[8:], uint32(h*2))
	binary.LittleEndian.PutUint16(header[12:], 1)
	binary.LittleEndian.PutUint16(header[14:], 32)
	binary.LittleEndian.PutUint32(header[20:], uint32(len(pixels)+len(mask)))

	out := make([]byte, 0, len(header)+len(pixels)+len(mask))
	out = append(out, header...)
	out = append(out, pixels...)
	out = append(out, mask...)
	return out
}
