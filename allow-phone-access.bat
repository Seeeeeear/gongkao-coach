@echo off
setlocal EnableDelayedExpansion

:: ============================================================
::  Let your phone reach the dev server on this PC.
::  Step 1: allow inbound TCP 5173 in Windows Firewall
::  Step 2: show the address to open on your phone
::
::  Usage: right-click -> "Run as administrator"
::         (or double-click; it will ask for elevation)
::
::  NOTE: keep this file ASCII-only and WITHOUT a BOM.
::        A UTF-8 BOM breaks the first line (chcp gets split into
::        "cp"/"t"/"r"), so do not add chcp or BOM here.
:: ============================================================

set PORT=5173
set RULENAME=GongkaoCoach-5173

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo.
  echo   Administrator rights required. Asking for elevation...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo.
echo   ============================================
echo     Gongkao Coach  -  allow phone access
echo   ============================================
echo.

netsh advfirewall firewall show rule name="%RULENAME%" >nul 2>&1
if %errorlevel% equ 0 (
  echo   [i] Firewall rule already exists, skipping.
) else (
  echo   Allowing inbound TCP %PORT% ...
  netsh advfirewall firewall add rule name="%RULENAME%" dir=in action=allow protocol=TCP localport=%PORT% profile=any >nul
  if !errorlevel! equ 0 (
    echo   [OK] Firewall rule added.
  ) else (
    echo   [X] Failed - make sure you ran this as administrator.
  )
)

echo.
echo   ============================================
echo     Now find the address for your phone
echo   ============================================
echo.
echo   Run this command in a normal window to list addresses:
echo.
echo       npm run lan-ip
echo.
echo   It prints something like:
echo.
echo       http://10.4.72.120:5173   ^<^<^< use this one   [WLAN]
echo.
echo   IMPORTANT: ignore any address that looks like
echo   192.168.x.1 or 172.x.x.1 - those belong to VMware /
echo   WSL / VirtualBox virtual adapters and your phone
echo   can never reach them.
echo.
echo   Or check manually:
echo   Settings - Network ^& Internet - WLAN - Hardware properties
echo.
echo   ---- Still not working? Check in order ----
echo.
echo   1. Phone and PC on the SAME WiFi (not guest network, not 4G/5G).
echo   2. The server must be running:   npm run serve
echo   3. Router "AP isolation" blocks device-to-device traffic.
echo      Workaround: turn on the phone hotspot, connect the PC to it,
echo      then re-run "npm run lan-ip" for the new address.
echo   4. Turn off VPN / proxy / accelerator software on the PC.
echo   5. If it still fails, skip the LAN entirely: deploy to
echo      Cloudflare Pages and get a public URL. See README.md.
echo.
pause
