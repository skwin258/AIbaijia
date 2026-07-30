Add-Type -AssemblyName System.Drawing

$sourcePath = "C:\Users\USER\Documents\Codex\2026-07-28\line-ai\public\home-poster.png"
$outPath = "C:\Users\USER\Documents\Codex\2026-07-28\line-ai\public\home-poster-no-button.png"

$bmp = [System.Drawing.Bitmap]::FromFile($sourcePath)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

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

$x = 150
$y = 1224
$w = 642
$h = 132
$path = RectPath $x $y $w $h 42

$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Rectangle -ArgumentList $x, $y, $w, $h),
  (Color "#071629" 245),
  (Color "#160824" 245),
  0
)
$g.FillPath($brush, $path)
$brush.Dispose()

$glowBrush = New-Object System.Drawing.SolidBrush (Color "#28F3D0" 28)
$g.FillEllipse($glowBrush, 125, 1190, 700, 210)
$glowBrush.Dispose()

$linePen = New-Object System.Drawing.Pen((Color "#6CEBFF" 42), 2)
$g.DrawLine($linePen, 172, 1288, 770, 1288)
$linePen.Dispose()

$path.Dispose()
$g.Dispose()
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Output $outPath
