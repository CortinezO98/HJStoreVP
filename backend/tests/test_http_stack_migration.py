"""Phase D HTTP stack migration contract tests (no database or external services).

These exercise Starlette/FastAPI multipart and URL-encoded form parsing.
Actual product and branding upload authorization is covered in test_main.
"""
from typing import Annotated
from importlib.metadata import version

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.testclient import TestClient


def make_client():
    app = FastAPI()

    @app.post("/image")
    async def receive_image(
        file: Annotated[UploadFile, File()],
        note: Annotated[str, Form()],
    ):
        data = await file.read(2049)
        if not data or len(data) > 2048:
            raise HTTPException(status_code=413, detail="Archivo supera el límite")
        return {
            "filename": file.filename,
            "content_type": file.content_type,
            "size": len(data),
            "note": note,
        }

    @app.post("/multi")
    async def receive_many(files: Annotated[list[UploadFile], File()]):
        return {"names": [item.filename for item in files]}

    @app.post("/form")
    async def receive_form(email: Annotated[str, Form()]):
        return {"email": email}

    return TestClient(app)


def test_multipart_image_and_text_field():
    with make_client() as client:
        response = client.post(
            "/image",
            data={"note": "Portada catálogo"},
            files={"file": ("cover.png", b"valid test bytes", "image/png")},
        )
    assert response.status_code == 200, response.text
    assert response.json() == {
        "filename": "cover.png", "content_type": "image/png",
        "size": 16, "note": "Portada catálogo",
    }


def test_required_upload_missing_remains_validation_error():
    with make_client() as client:
        response = client.post("/image", data={"note": "sin archivo"})
    assert response.status_code == 422


def test_upload_size_limit_and_empty_file():
    with make_client() as client:
        assert client.post("/image", data={"note": "large"},
                           files={"file": ("big.png", b"X" * 2049, "image/png")}).status_code == 413
        assert client.post("/image", data={"note": "empty"},
                           files={"file": ("empty.png", b"", "image/png")}).status_code == 413


def test_multiple_files_preserve_order():
    with make_client() as client:
        response = client.post("/multi", files=[
            ("files", ("a.png", b"a", "image/png")),
            ("files", ("b.jpg", b"b", "image/jpeg")),
        ])
    assert response.status_code == 200, response.text
    assert response.json() == {"names": ["a.png", "b.jpg"]}


def test_urlencoded_form_supported():
    with make_client() as client:
        response = client.post("/form", data={"email": "cliente@example.com"})
    assert response.status_code == 200, response.text
    assert response.json()["email"] == "cliente@example.com"


def test_malformed_multipart_does_not_succeed():
    with make_client() as client:
        response = client.post("/image", content=b"broken-multipart",
                               headers={"content-type": "multipart/form-data; boundary=xyz"})
    assert response.status_code in (400, 422)


def test_http_dependency_versions_are_expected():
    assert version("fastapi") == "0.165.0"
    assert version("starlette") == "1.10.0"
    assert version("python-multipart") == "0.0.34"
