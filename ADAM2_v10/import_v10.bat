@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

REM ===== Settings (edit if needed) =====
set PGHOST=127.0.0.1
set PGPORT=5432
set PGUSER=postgres
set DBNAME=adam_v10
set PGCLIENTENCODING=UTF8
REM =====================================

REM --- find psql.exe ---
set PSQL=
for /f "delims=" %%i in ('where psql 2^>nul') do if not defined PSQL set "PSQL=%%i"
if not defined PSQL (
  for /d %%d in ("C:\Program Files\PostgreSQL\*") do if exist "%%d\bin\psql.exe" set "PSQL=%%d\bin\psql.exe"
)
if not defined PSQL (
  echo [ERROR] psql.exe not found. Please install PostgreSQL or add its bin folder to PATH.
  pause & exit /b 1
)
echo Using: "%PSQL%"
echo.
echo This will DROP and re-create database "%DBNAME%" on %PGHOST%:%PGPORT% as user %PGUSER%.
echo (Close pgAdmin connections to %DBNAME% first.)
set /p OK=Continue? (Y/N): 
if /i not "%OK%"=="Y" exit /b 0
set /p PGPASSWORD=Password for %PGUSER%: 
echo.

echo [1/4] Creating database %DBNAME% ...
"%PSQL%" -d postgres -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS %DBNAME%" -c "CREATE DATABASE %DBNAME% ENCODING 'UTF8' TEMPLATE template0" || goto fail

echo [2/4] Creating tables (schema.sql) ...
"%PSQL%" -d %DBNAME% -v ON_ERROR_STOP=1 -q -f schema.sql || goto fail

echo [3/4] Importing data (import.sql) ...
"%PSQL%" -d %DBNAME% -v ON_ERROR_STOP=1 -q -f import.sql >nul || goto fail

echo [4/4] Checking row counts ...
"%PSQL%" -d %DBNAME% -c "SELECT 'molecules' AS table_name, count(*) FROM molecules UNION ALL SELECT 'peptide_records', count(*) FROM peptide_records UNION ALL SELECT 'bioactivities', count(*) FROM bioactivities UNION ALL SELECT 'source_texts', count(*) FROM source_texts UNION ALL SELECT 'record_publications', count(*) FROM record_publications UNION ALL SELECT 'publications', count(*) FROM publications"
echo Expected: molecules 56621, peptide_records 57481, bioactivities 85398, source_texts 21573, record_publications 33541, publications 7080
echo.
echo Done. In pgAdmin: right-click Databases ^> Refresh, then open "%DBNAME%".
pause
exit /b 0

:fail
echo.
echo [ERROR] Import failed. Check the message above (wrong password? database in use?).
pause
exit /b 1
