@echo off
chcp 65001 >nul
title Parser UEA - Historico Escolar

echo.
echo ================================================
echo   grade-interativa - Parser de Historico UEA
echo   Servidor em http://localhost:5001
echo   OCR: Tesseract ativo
echo   Mantenha esta janela aberta
echo ================================================
echo.

where python >nul 2>&1
if %errorlevel%==0 (
    python "%~dp0server.py"
) else if exist "%LOCALAPPDATA%\Programs\Python\Python39\python.exe" (
    "%LOCALAPPDATA%\Programs\Python\Python39\python.exe" "%~dp0server.py"
) else if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" "%~dp0server.py"
) else (
    echo ERRO: Python nao encontrado.
    echo Instale Python em https://www.python.org/downloads/
)

echo.
echo Servidor encerrado. Pressione qualquer tecla...
pause >nul
