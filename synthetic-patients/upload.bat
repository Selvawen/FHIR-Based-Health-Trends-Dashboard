@echo off
setlocal enabledelayedexpansion

set FHIR_URL=http://localhost:8090/fhir

for %%f in (*.json) do (
    echo Uploading %%f
    curl -X POST %FHIR_URL% ^
        -H "Content-Type: application/fhir+json" ^
        --data-binary "@%%f"
)

echo Done uploading all files.
pause