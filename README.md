# GitHub Pull Request Explorer - Django

## Features

- Repository summary
- Pull request list
- Dynamic AND filters
- Status equals filter
- Author equals/contains filters
- Repository filter ready for the interview product change
- Loading, error and empty states
- API tester
- API request/response logging to SQLite
- Read-only database query interface
- Bonus PR counts
- Responsive layout

## Setup

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and set:

```text
MOCK_GITHUB_BASE_URL=<the exact Mock GitHub API base URL from the assignment>
```

Then:

```bash
python manage.py migrate
python manage.py runserver
```

Open:

http://127.0.0.1:8000/

## Important

The screenshots do not expose the actual Mock GitHub API base URL. Do not invent it. Put the exact URL supplied by the assignment/sandbox into `.env`.

## Database query example

The SQLite table created by Django is:

```sql
explorer_apilog
```

Example:

```sql
SELECT id, method, url, status_code, response_time_ms, success, created_at
FROM explorer_apilog
WHERE status_code > 399 OR response_time_ms > 2000
ORDER BY created_at DESC;
```

## Interview product change

The frontend filter engine uses:

```javascript
{
    field: "status",
    operator: "equals",
    value: "OPEN"
}
```

and supports `repository` as a field already, so adding the requested Repository filter during the interview is straightforward.

### Troubleshooting
If the page loads but buttons do nothing, hard-refresh the browser after starting the server. The project includes Django CSRF setup and the JavaScript syntax fix required for the buttons to register.
