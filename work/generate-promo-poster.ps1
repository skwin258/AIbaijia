Add-Type -AssemblyName System.Drawing

$sourcePath = "C:\Users\USER\Downloads\Telegram Desktop\photo_2026-07-30_20-46-48.jpg"
$iconPath = "C:\Users\USER\Documents\Codex\2026-07-28\line-ai\public\ai-chip-icon-small.png"
$outDir = "C:\Users\USER\Documents\Codex\2026-07-28\line-ai\outputs"
$outPath = Join-Path $outDir "sk-ai-baccarat-poster.png"

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$W = 1080
$H = 2400
$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

function Color($hex, $alpha = 255) {
  $hex = $hex.TrimStart("#")
  return [System.Drawing.Color]::FromArgb($alpha, [Convert]::ToInt32($hex.Substring(0,2),16), [Convert]::ToInt32($hex.Substring(2,2),16), [Convert]::ToInt32($hex.Substring(4,2),16))
}

function RectPath($x, $y, $w, $h, $r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function FillRound($x, $y, $w, $h, $r, $brush, $pen = $null) {
  $path = RectPath $x $y $w $h $r
  $g.FillPath($brush, $path)
  if ($pen -ne $null) { $g.DrawPath($pen, $path) }
  $path.Dispose()
}

function DrawText($text, $x, $y, $size, $color, $style = [System.Drawing.FontStyle]::Bold, $align = "Near", $width = 900, $line = 1.22) {
  $font = New-Object System.Drawing.Font("Microsoft JhengHei", $size, $style, [System.Drawing.GraphicsUnit]::Pixel)
  $brush = New-Object System.Drawing.SolidBrush $color
  $format = New-Object System.Drawing.StringFormat
  if ($align -eq "Center") { $format.Alignment = [System.Drawing.StringAlignment]::Center }
  elseif ($align -eq "Far") { $format.Alignment = [System.Drawing.StringAlignment]::Far }
  $format.LineAlignment = [System.Drawing.StringAlignment]::Near
  $rect = New-Object System.Drawing.RectangleF($x, $y, $width, 400)
  $g.DrawString($text, $font, $brush, $rect, $format)
  $font.Dispose()
  $brush.Dispose()
  $format.Dispose()
}

function GlowEllipse($x, $y, $w, $h, $color) {
  for ($i = 16; $i -ge 1; $i--) {
    $alpha = [Math]::Max(2, [int]($color.A / ($i * 1.5)))
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($alpha, $color.R, $color.G, $color.B))
    $pad = $i * 20
    $g.FillEllipse($brush, $x - $pad, $y - $pad, $w + $pad * 2, $h + $pad * 2)
    $brush.Dispose()
  }
}

function DrawGlassCard($x, $y, $w, $h, $title, $body) {
  $cardRect = New-Object System.Drawing.Rectangle -ArgumentList $x, $y, $w, $h
  $cardBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $cardRect,
    (Color "#FFFFFF" 42),
    (Color "#7755FF" 24),
    35
  )
  $pen = New-Object System.Drawing.Pen((Color "#9FEAFF" 82), 2)
  FillRound $x $y $w $h 30 $cardBrush $pen
  $cardBrush.Dispose()
  $pen.Dispose()

  $accent = New-Object System.Drawing.SolidBrush (Color "#61F2FF" 210)
  $g.FillEllipse($accent, $x + $w - 58, $y + 28, 20, 20)
  $accent.Dispose()
  DrawText $title ($x + 28) ($y + 26) 34 (Color "#FFFFFF") ([System.Drawing.FontStyle]::Bold) "Near" ($w - 56)
  DrawText $body ($x + 28) ($y + 82) 25 (Color "#C2D6E8") ([System.Drawing.FontStyle]::Regular) "Near" ($w - 56)
}

$bgRect = New-Object System.Drawing.Rectangle -ArgumentList 0, 0, $W, $H
$bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  $bgRect,
  (Color "#08091B"),
  (Color "#040713"),
  90
)
$g.FillRectangle($bg, 0, 0, $W, $H)
$bg.Dispose()

GlowEllipse -x -130 -y -80 -w 520 -h 520 -color (Color "#2CE4FF" 118)
GlowEllipse -x 730 -y 120 -w 480 -h 520 -color (Color "#8756FF" 112)
GlowEllipse -x 210 -y 1500 -w 660 -h 440 -color (Color "#2AFFC8" 70)

$gridPen = New-Object System.Drawing.Pen((Color "#7DEAFF" 22), 1)
for ($x = 0; $x -le $W; $x += 54) { $g.DrawLine($gridPen, $x, 0, $x, $H) }
for ($y = 0; $y -le $H; $y += 54) { $g.DrawLine($gridPen, 0, $y, $W, $y) }
$gridPen.Dispose()

$shinePen = New-Object System.Drawing.Pen((Color "#7CEFFF" 85), 3)
$shinePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$shinePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$g.DrawLine($shinePen, 160, 128, 920, 128)
$g.DrawLine($shinePen, 250, 335, 830, 335)
$g.DrawLine($shinePen, 34, 650, 210, 492)
$g.DrawLine($shinePen, 892, 1390, 1060, 1240)
$shinePen.Dispose()

$badgeBrush = New-Object System.Drawing.SolidBrush (Color "#FFFFFF" 26)
$badgePen = New-Object System.Drawing.Pen((Color "#80EFFF" 105), 2)
FillRound 298 68 484 62 31 $badgeBrush $badgePen
$badgeBrush.Dispose()
$badgePen.Dispose()
DrawText "Safari 浮動外掛助手" 0 84 26 (Color "#8EF4FF") ([System.Drawing.FontStyle]::Bold) "Center" $W

DrawText ("SK AI 百家樂" + [Environment]::NewLine + "外掛助手") 0 154 84 (Color "#FFFFFF") ([System.Drawing.FontStyle]::Bold) "Center" $W
DrawText ("手機即開即用，邊看牌路邊輸入" + [Environment]::NewLine + "AI 即時給出下一局分析。") 0 352 32 (Color "#C8DAEA") ([System.Drawing.FontStyle]::Regular) "Center" $W

$phoneX = 244
$phoneY = 486
$phoneW = 592
$phoneH = 1048
GlowEllipse -x 250 -y 540 -w 580 -h 900 -color (Color "#30DFFF" 82)
$orbitPen = New-Object System.Drawing.Pen((Color "#83EEFF" 74), 3)
$g.DrawEllipse($orbitPen, 156, 438, 768, 1052)
$g.DrawEllipse($orbitPen, 116, 476, 848, 986)
$orbitPen.Dispose()

$outerRect = New-Object System.Drawing.Rectangle -ArgumentList ($phoneX - 24), ($phoneY - 24), ($phoneW + 48), ($phoneH + 48)
$outerBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  $outerRect,
  (Color "#FFFFFF" 48),
  (Color "#7755FF" 26),
  35
)
$outerPen = New-Object System.Drawing.Pen((Color "#FFE5A0" 92), 3)
FillRound ($phoneX - 24) ($phoneY - 24) ($phoneW + 48) ($phoneH + 48) 78 $outerBrush $outerPen
$outerBrush.Dispose()
$outerPen.Dispose()

$phoneBrush = New-Object System.Drawing.SolidBrush (Color "#07111F")
$phonePen = New-Object System.Drawing.Pen((Color "#FFFFFF" 44), 2)
FillRound $phoneX $phoneY $phoneW $phoneH 58 $phoneBrush $phonePen
$phoneBrush.Dispose()
$phonePen.Dispose()

$screen = [System.Drawing.Image]::FromFile($sourcePath)
$clipPath = RectPath ($phoneX + 18) ($phoneY + 18) ($phoneW - 36) ($phoneH - 36) 42
$oldClip = $g.Clip
$g.SetClip($clipPath)
$sw = $screen.Width
$sh = $screen.Height
$scale = [Math]::Max(($phoneW - 36) / $sw, ($phoneH - 36) / $sh)
$dw = $sw * $scale
$dh = $sh * $scale
$dx = $phoneX + 18 + (($phoneW - 36) - $dw) / 2
$dy = $phoneY + 18 + (($phoneH - 36) - $dh) / 2
$g.DrawImage($screen, [float]$dx, [float]$dy, [float]$dw, [float]$dh)
$g.Clip = $oldClip
$clipPath.Dispose()
$screen.Dispose()

$icon = [System.Drawing.Image]::FromFile($iconPath)
$g.DrawImage($icon, 738, 392, 198, 198)
$icon.Dispose()

$floorBrush = New-Object System.Drawing.SolidBrush (Color "#2CE4FF" 42)
$g.FillEllipse($floorBrush, 190, 1516, 700, 92)
$floorBrush.Dispose()

$ctaRect = New-Object System.Drawing.Rectangle -ArgumentList 220, 1586, 640, 100
$ctaBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  $ctaRect,
  (Color "#7DF7FF"),
  (Color "#9FFF7A"),
  18
)
$ctaPen = New-Object System.Drawing.Pen((Color "#FFFFFF" 142), 2)
FillRound 220 1586 640 100 32 $ctaBrush $ctaPen
$ctaBrush.Dispose()
$ctaPen.Dispose()
DrawText "安裝外掛助手" 0 1612 44 (Color "#061523") ([System.Drawing.FontStyle]::Bold) "Center" $W

DrawText "看路更快，判斷更穩" 0 1740 54 (Color "#FFFFFF") ([System.Drawing.FontStyle]::Bold) "Center" $W
DrawText "讓每一局都有依據" 0 1814 32 (Color "#BDD0E1") ([System.Drawing.FontStyle]::Regular) "Center" $W

$miniBrush = New-Object System.Drawing.SolidBrush (Color "#FFFFFF" 24)
$miniPen = New-Object System.Drawing.Pen((Color "#FFD66A" 86), 2)
FillRound 348 1865 384 52 26 $miniBrush $miniPen
$miniBrush.Dispose()
$miniPen.Dispose()
DrawText "四大核心功能" 0 1877 24 (Color "#FFE193") ([System.Drawing.FontStyle]::Bold) "Center" $W

DrawGlassCard 66 1942 446 176 "輸入路圖" "快速記錄每一局結果"
DrawGlassCard 568 1942 446 176 "開始分析" "進入快捷輸入模式"
DrawGlassCard 66 2142 446 176 "目前戰績" ("查看當局 / 當日" + [Environment]::NewLine + "勝負與獲利")
DrawGlassCard 568 2142 446 176 "AI 通知" ("下一局推薦" + [Environment]::NewLine + "即時跳出")

$chipBrush = New-Object System.Drawing.SolidBrush (Color "#07111F" 148)
$chipPen = New-Object System.Drawing.Pen((Color "#80EFFF" 70), 2)
$chipY = 2348
$chipX = 122
foreach ($chip in @("浮動 ICON", "即時路圖", "AI 建議", "手機專用")) {
  FillRound $chipX $chipY 192 42 21 $chipBrush $chipPen
  DrawText $chip ($chipX) ($chipY + 9) 19 (Color "#9EEFFF") ([System.Drawing.FontStyle]::Bold) "Center" 192
  $chipX += 210
}
$chipBrush.Dispose()
$chipPen.Dispose()

$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()

Write-Output $outPath
