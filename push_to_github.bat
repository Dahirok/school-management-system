@echo off
echo.
echo ==========================================
echo    SENDING CODE TO GITHUB
echo ==========================================
echo.
echo A login window should pop up in a moment.
echo Please click "Sign in with your browser" to continue.
echo.
"C:\Program Files\Git\bin\git.exe" push -u origin main
echo.
echo ==========================================
echo    FINISHED! Press any key to close.
echo ==========================================
pause
