# Reads handwriting from Paper strokes using Windows' own built-in handwriting recognizer (offline, nothing installed).
# Input: a JSON file of strokes [[x,y,x,y,...], ...]. Output: the recognized text, one line per group.
param([string]$Path)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
[Windows.UI.Input.Inking.InkStrokeBuilder, Windows.UI.Input, ContentType = WindowsRuntime] | Out-Null
[Windows.UI.Input.Inking.InkStrokeContainer, Windows.UI.Input, ContentType = WindowsRuntime] | Out-Null
[Windows.UI.Input.Inking.InkRecognizerContainer, Windows.UI.Input, ContentType = WindowsRuntime] | Out-Null
$strokes = Get-Content -Raw -Encoding UTF8 $Path | ConvertFrom-Json
$builder = New-Object Windows.UI.Input.Inking.InkStrokeBuilder
$container = New-Object Windows.UI.Input.Inking.InkStrokeContainer
foreach ($s in $strokes) {
  $pts = New-Object 'System.Collections.Generic.List[Windows.Foundation.Point]'
  for ($i = 0; $i -lt $s.Count - 1; $i += 2) { $pts.Add((New-Object Windows.Foundation.Point -ArgumentList ([double]$s[$i]), ([double]$s[$i + 1]))) }
  if ($pts.Count -gt 1) { $container.AddStroke($builder.CreateStroke($pts)) }
}
$rec = New-Object Windows.UI.Input.Inking.InkRecognizerContainer
$type = [System.Collections.Generic.IReadOnlyList[Windows.UI.Input.Inking.InkRecognitionResult]]
$results = Await ($rec.RecognizeAsync($container, [Windows.UI.Input.Inking.InkRecognitionTarget]::All)) $type
($results | ForEach-Object { $c = $_.GetTextCandidates(); if ($c.Count) { $c[0] } }) -join "`n"
