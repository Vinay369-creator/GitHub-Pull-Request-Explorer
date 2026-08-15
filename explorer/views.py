import json
import time
from urllib.parse import urlparse

import requests
from django.conf import settings
from django.db import connection
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt

from .models import ApiLog


def index(request):
    return render(request, "explorer/index.html")


def _mock_base_url():
    if not settings.MOCK_GITHUB_BASE_URL:
        raise ValueError(
            "MOCK_GITHUB_BASE_URL is not configured. Copy .env.example to .env "
            "and add the Mock GitHub API base URL supplied by the assignment."
        )
    return settings.MOCK_GITHUB_BASE_URL


def _github_headers(token):
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }

def _safe_json(response):
    try:
        return response.json()
    except ValueError:
        return {"raw_response": response.text}


def _save_log(method, url, headers, query_params, request_body,
              response_body, status_code, elapsed, success, error_message=""):
    # Do not persist the raw Authorization token.
    safe_headers = {
        k: ("***REDACTED***" if k.lower() == "authorization" else v)
        for k, v in headers.items()
    }
    return ApiLog.objects.create(
        method=method,
        url=url,
        headers=safe_headers,
        query_params=query_params or {},
        request_body=request_body if request_body is not None else {},
        response_body=response_body if response_body is not None else {},
        status_code=status_code,
        response_time_ms=round(elapsed * 1000, 2),
        success=success,
        error_message=error_message,
    )

@csrf_exempt
@require_http_methods(["POST"])
def repository_api(request):
    try:
        data = json.loads(request.body or "{}")

        owner = data.get("owner", "").strip()
        repo = data.get("repo", "").strip()
        token = data.get("token", "").strip()

        if not owner or not repo or not token:
            return JsonResponse({
                "success": False,
                "error": "Owner, repository and token are required."
            }, status=400)

        base_url = settings.MOCK_GITHUB_BASE_URL.rstrip("/")
        url = f"{base_url}/repos/{owner}/{repo}"

        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }

        print("REQUEST URL:", url)
        print("TOKEN PRESENT:", bool(token))

        response = requests.get(
            url,
            headers=headers,
            timeout=60
        )

        print("API STATUS:", response.status_code)
        print("API RESPONSE:", response.text[:500])

        try:
            response_data = response.json()
        except ValueError:
            response_data = {
                "raw_response": response.text
            }

        if not response.ok:
            return JsonResponse({
                "success": False,
                "error": "Mock API returned an error.",
                "status_code": response.status_code,
                "data": response_data
            }, status=response.status_code)

        return JsonResponse({
            "success": True,
            "data": response_data
        })

    except requests.RequestException as exc:
        print("REQUEST ERROR:", exc)

        return JsonResponse({
            "success": False,
            "error": f"API connection failed: {exc}"
        }, status=502)

    except json.JSONDecodeError:
        return JsonResponse({
            "success": False,
            "error": "Invalid JSON received from frontend."
        }, status=400)

    except Exception as exc:
        print("UNEXPECTED ERROR:", exc)

        return JsonResponse({
            "success": False,
            "error": str(exc)
        }, status=500)


@require_http_methods(["POST"])
def pulls_api(request):
    try:
        data = json.loads(request.body or "{}")
        owner = data.get("owner", "").strip()
        repo = data.get("repo", "").strip()
        token = data.get("token", "").strip()

        if not owner or not repo or not token:
            return JsonResponse(
                {"success": False, "error": "Owner, repository and token are required."},
                status=400,
            )

        url = f"{_mock_base_url()}/repos/{owner}/{repo}/pulls"
        headers = _github_headers(token)

        started = time.perf_counter()
        response = requests.get(url, headers=headers, timeout=10)
        elapsed = time.perf_counter() - started
        body = _safe_json(response)

        _save_log(
            "GET", url, headers, {}, None, body,
            response.status_code, elapsed, response.ok,
            "" if response.ok else str(body),
        )

        if not response.ok:
            return JsonResponse(
                {
                    "success": False,
                    "error": "Pull request request failed.",
                    "status_code": response.status_code,
                    "data": body,
                },
                status=response.status_code,
            )

        return JsonResponse({"success": True, "data": body})

    except requests.RequestException as exc:
        return JsonResponse({"success": False, "error": f"API connection failed: {exc}"}, status=502)
    except ValueError as exc:
        return JsonResponse({"success": False, "error": str(exc)}, status=500)
    except json.JSONDecodeError:
        return JsonResponse({"success": False, "error": "Invalid JSON request."}, status=400)


def _validate_tester_url(url):
    base = _mock_base_url()
    parsed = urlparse(url)
    base_parsed = urlparse(base)

    # Keep the challenge API tester restricted to the supplied Mock API.
    if not parsed.scheme or not parsed.netloc:
        raise ValueError("Enter a complete URL.")
    if parsed.netloc != base_parsed.netloc:
        raise ValueError("For this challenge, the API tester can call only the supplied Mock API host.")


@require_http_methods(["POST"])
def api_tester(request):
    try:
        data = json.loads(request.body or "{}")
        method = data.get("method", "GET").upper()
        url = data.get("url", "").strip()
        headers = data.get("headers") or {}
        params = data.get("params") or {}
        body = data.get("body")

        if method not in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
            return JsonResponse({"success": False, "error": "Unsupported HTTP method."}, status=400)

        if not url:
            return JsonResponse({"success": False, "error": "URL is required."}, status=400)

        _validate_tester_url(url)

        if isinstance(body, str) and body.strip():
            try:
                body = json.loads(body)
            except json.JSONDecodeError as exc:
                return JsonResponse({"success": False, "error": f"Invalid JSON request body: {exc}"}, status=400)
        elif body in ("", None):
            body = None

        started = time.perf_counter()
        response = requests.request(
            method=method,
            url=url,
            headers=headers,
            params=params,
            json=body,
            timeout=15,
        )
        elapsed = time.perf_counter() - started
        response_body = _safe_json(response)

        _save_log(
            method, response.url, headers, params, body,
            response_body, response.status_code, elapsed, response.ok,
            "" if response.ok else str(response_body),
        )

        return JsonResponse({
            "success": response.ok,
            "status_code": response.status_code,
            "response_time_ms": round(elapsed * 1000, 2),
            "data": response_body,
            "error": "" if response.ok else "Request returned an error status.",
        })

    except requests.RequestException as exc:
        return JsonResponse({"success": False, "error": f"Request failed: {exc}"}, status=502)
    except ValueError as exc:
        return JsonResponse({"success": False, "error": str(exc)}, status=400)
    except json.JSONDecodeError:
        return JsonResponse({"success": False, "error": "Invalid JSON request."}, status=400)


@require_http_methods(["GET"])
def logs_list(request):
    logs = list(
        ApiLog.objects.values(
            "id", "method", "url", "status_code",
            "response_time_ms", "success", "created_at"
        )[:100]
    )
    for item in logs:
        item["created_at"] = item["created_at"].isoformat()
    return JsonResponse({"success": True, "data": logs})


@require_http_methods(["POST"])
def query_logs(request):
    try:
        data = json.loads(request.body or "{}")
        query = data.get("query", "").strip()

        if not query:
            return JsonResponse({"success": False, "error": "Query is required."}, status=400)

        normalized = query.lower()
        if not normalized.startswith("select"):
            return JsonResponse(
                {"success": False, "error": "Only SELECT queries are allowed."},
                status=400,
            )

        # Challenge-only guardrail: prevent writes/schema changes.
        blocked = [
            "insert ", "update ", "delete ", "drop ", "alter ",
            "create ", "replace ", "truncate ", "attach ", "pragma "
        ]
        if any(word in normalized for word in blocked):
            return JsonResponse(
                {"success": False, "error": "Only read-only SELECT queries are allowed."},
                status=400,
            )

        with connection.cursor() as cursor:
            cursor.execute(query)
            columns = [col[0] for col in cursor.description]
            rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

        for row in rows:
            for key, value in row.items():
                if hasattr(value, "isoformat"):
                    row[key] = value.isoformat()

        return JsonResponse({
            "success": True,
            "columns": columns,
            "rows": rows,
            "count": len(rows),
        })

    except Exception as exc:
        return JsonResponse({"success": False, "error": str(exc)}, status=400)
