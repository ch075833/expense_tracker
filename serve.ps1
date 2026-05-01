$ErrorActionPreference = "Stop"

$port = if ($args.Count -gt 0) { [int]$args[0] } else { 4173 }
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), $port)
$listener.Start()

Write-Host "Expense Tracker running at http://127.0.0.1:$port/"

$contentTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css" = "text/css; charset=utf-8"
  ".js" = "text/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".webmanifest" = "application/manifest+json; charset=utf-8"
  ".svg" = "image/svg+xml"
}

function Send-Response {
  param (
    [System.Net.Sockets.NetworkStream]$Stream,
    [int]$StatusCode,
    [string]$StatusText,
    [string]$ContentType,
    [byte[]]$Body
  )

  $headers = "HTTP/1.1 $StatusCode $StatusText`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nConnection: close`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  $Stream.Write($Body, 0, $Body.Length)
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    $stream = $client.GetStream()

    try {
      $buffer = New-Object byte[] 4096
      $read = $stream.Read($buffer, 0, $buffer.Length)
      if ($read -le 0) {
        $client.Close()
        continue
      }

      $request = [System.Text.Encoding]::ASCII.GetString($buffer, 0, $read)
      $requestLine = ($request -split "`r`n")[0]
      $parts = $requestLine -split " "

      if ($parts.Count -lt 2 -or $parts[0] -ne "GET") {
        Send-Response $stream 405 "Method Not Allowed" "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes("Method not allowed"))
        continue
      }

      $requestPath = [System.Uri]::UnescapeDataString(($parts[1] -split "\?")[0].TrimStart("/"))
      if ([string]::IsNullOrWhiteSpace($requestPath)) {
        $requestPath = "index.html"
      }

      $combinedPath = Join-Path $root $requestPath
      $resolvedPath = Resolve-Path -LiteralPath $combinedPath -ErrorAction SilentlyContinue

      if ($resolvedPath -and (Get-Item -LiteralPath $resolvedPath.Path).PSIsContainer) {
        $resolvedPath = Resolve-Path -LiteralPath (Join-Path $resolvedPath.Path "index.html") -ErrorAction SilentlyContinue
      }

      if (-not $resolvedPath -or -not $resolvedPath.Path.StartsWith($root)) {
        Send-Response $stream 404 "Not Found" "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes("Not found"))
        continue
      }

      $extension = [System.IO.Path]::GetExtension($resolvedPath.Path)
      $contentType = $contentTypes[$extension]
      if (-not $contentType) {
        $contentType = "application/octet-stream"
      }

      $body = [System.IO.File]::ReadAllBytes($resolvedPath.Path)
      Send-Response $stream 200 "OK" $contentType $body
    }
    finally {
      $stream.Close()
      $client.Close()
    }
  }
}
finally {
  $listener.Stop()
}
