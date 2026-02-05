@echo off
echo Clearing Python cache files...
cd backend
del /s /q *.pyc
for /d /r . %%d in (__pycache__) do @if exist "%%d" rd /s /q "%%d"
echo Cache cleared!
echo.
echo Please restart the backend server now.
pause
