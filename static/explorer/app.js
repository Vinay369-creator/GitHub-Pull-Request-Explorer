let allPullRequests = [];
let filters = [];
let filterId = 0;

const $ = (id) => document.getElementById(id);

function getCredentials() {
    return {
        owner: $("owner").value.trim(),
        repo: $("repo").value.trim(),
        token: $("token").value.trim()
    };
}

function show(id) { $(id).classList.remove("hidden"); }
function hide(id) { $(id).classList.add("hidden"); }

function showError(id, message) {
    $(id).textContent = message;
    show(id);
}

async function postJSON(url, data) {
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": getCookie("csrftoken")
        },
        body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
        throw new Error(result.error || `Request failed (${response.status})`);
    }
    return result;
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(";").shift();
    return "";
}

$("repoBtn").addEventListener("click", async () => {
    hide("explorerError");
    hide("repoCard");
    show("explorerLoading");

    try {
        const result = await postJSON("/api/repository/", getCredentials());
        const r = result.data;

        $("repoName").textContent = r.name ?? "-";
        $("repoDescription").textContent = r.description || "No description";
        $("repoStars").textContent = r.stargazers_count ?? r.stars ?? 0;
        $("repoForks").textContent = r.forks_count ?? r.forks ?? 0;
        $("repoIssues").textContent = r.open_issues_count ?? r.open_issues ?? 0;

        show("repoCard");
    } catch (error) {
        showError("explorerError", error.message);
    } finally {
        hide("explorerLoading");
    }
});

$("pullsBtn").addEventListener("click", async () => {
    hide("explorerError");
    show("explorerLoading");

    try {
        const result = await postJSON("/api/pulls/", getCredentials());
        allPullRequests = normalizePullRequests(result.data);

        filters = [];
        renderFilters();
        renderPullRequests(allPullRequests);

        show("filterCard");
        show("pullsCard");
    } catch (error) {
        showError("explorerError", error.message);
    } finally {
        hide("explorerLoading");
    }
});

function normalizePullRequests(data) {
    const list = Array.isArray(data) ? data : (data.items || data.pull_requests || data.data || []);

    return list.map(pr => ({
        title: pr.title ?? pr.name ?? "Untitled",
        author: pr.user?.login ?? pr.author?.login ?? pr.author ?? "Unknown",
        status: String(pr.state ?? pr.status ?? "OPEN").toUpperCase(),
        repository: pr.base?.repo?.name ?? pr.repository?.name ?? pr.repo ?? $("repo").value.trim(),
        created: pr.created_at ?? pr.createdAt ?? ""
    }));
}

$("addFilterBtn").addEventListener("click", () => {
    filters.push({
        id: ++filterId,
        field: "status",
        operator: "equals",
        value: "OPEN"
    });
    renderFilters();
});

function renderFilters() {
    const container = $("filters");
    container.innerHTML = "";

    if (!filters.length) {
        container.innerHTML = '<div class="hint">No filters applied. Click "+ Add Filter" to create one.</div>';
        return;
    }

    filters.forEach(filter => {
        const row = document.createElement("div");
        row.className = "filter-row";

        row.innerHTML = `
            <label>
                Field
                <select class="filter-field" data-id="${filter.id}">
                    <option value="status" ${filter.field === "status" ? "selected" : ""}>Status</option>
                    <option value="author" ${filter.field === "author" ? "selected" : ""}>Author</option>
                    <option value="repository" ${filter.field === "repository" ? "selected" : ""}>Repository</option>
                </select>
            </label>
            <label>
                Operator
                <select class="filter-operator" data-id="${filter.id}">
                    ${operatorOptions(filter)}
                </select>
            </label>
            <label>
                Value
                <input class="filter-value" data-id="${filter.id}" value="${escapeHtml(filter.value)}">
            </label>
            <button class="remove-filter" data-id="${filter.id}">Remove</button>
        `;

        container.appendChild(row);
    });

    container.querySelectorAll(".filter-field").forEach(el => {
        el.addEventListener("change", e => {
            const filter = filters.find(f => f.id === Number(e.target.dataset.id));
            filter.field = e.target.value;
            filter.operator = "equals";
            renderFilters();
        });
    });

    container.querySelectorAll(".filter-operator").forEach(el => {
        el.addEventListener("change", e => {
            const filter = filters.find(f => f.id === Number(e.target.dataset.id));
            filter.operator = e.target.value;
        });
    });

    container.querySelectorAll(".filter-value").forEach(el => {
        el.addEventListener("input", e => {
            const filter = filters.find(f => f.id === Number(e.target.dataset.id));
            filter.value = e.target.value;
        });
    });

    container.querySelectorAll(".remove-filter").forEach(el => {
        el.addEventListener("click", e => {
            filters = filters.filter(f => f.id !== Number(e.target.dataset.id));
            renderFilters();
            applyFilters();
        });
    });
}

function operatorOptions(filter) {
    if (filter.field === "author") {
        return `
            <option value="equals" ${filter.operator === "equals" ? "selected" : ""}>Equals</option>
            <option value="contains" ${filter.operator === "contains" ? "selected" : ""}>Contains</option>
        `;
    }
    return `<option value="equals">Equals</option>`;
}

function applyFilters() {
    let result = allPullRequests.filter(pr => {
        return filters.every(filter => matchesFilter(pr, filter));
    });

    renderPullRequests(result);
}

$("applyFiltersBtn").addEventListener("click", applyFilters);

$("clearFiltersBtn").addEventListener("click", () => {
    filters = [];
    renderFilters();
    renderPullRequests(allPullRequests);
});

function matchesFilter(pr, filter) {
    const fieldMap = {
        status: pr.status,
        author: pr.author,
        repository: pr.repository
    };

    const actual = String(fieldMap[filter.field] ?? "").toLowerCase();
    const expected = String(filter.value ?? "").trim().toLowerCase();

    if (filter.operator === "contains") {
        return actual.includes(expected);
    }
    return actual === expected;
}

$("tableSearch").addEventListener("input", e => {
    const q = e.target.value.trim().toLowerCase();
    const result = allPullRequests.filter(pr =>
        pr.title.toLowerCase().includes(q) ||
        pr.author.toLowerCase().includes(q)
    );
    renderPullRequests(result);
});

function renderPullRequests(list) {
    const tbody = $("pullsTable").querySelector("tbody");
    tbody.innerHTML = "";

    $("totalCount").textContent = `${list.length} PRs`;
    $("openCount").textContent = `${list.filter(x => x.status === "OPEN").length} Open`;
    $("closedCount").textContent = `${list.filter(x => x.status === "CLOSED").length} Closed`;

    if (!list.length) {
        show("emptyState");
        $("pullsTable").classList.add("hidden");
        return;
    }

    hide("emptyState");
    $("pullsTable").classList.remove("hidden");

    list.forEach(pr => {
        const tr = document.createElement("tr");
        const statusClass = pr.status === "OPEN" ? "open" : "closed";
        tr.innerHTML = `
            <td>${escapeHtml(pr.title)}</td>
            <td>${escapeHtml(pr.author)}</td>
            <td><span class="status ${statusClass}">${escapeHtml(pr.status)}</span></td>
            <td>${escapeHtml(pr.repository)}</td>
            <td>${escapeHtml(formatDate(pr.created))}</td>
        `;
        tbody.appendChild(tr);
    });
}

function formatDate(value) {
    if (!value) return "-";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

/* ---------- API Tester ---------- */

function addKeyValueRow(containerId, key = "", value = "") {
    const container = $(containerId);
    const row = document.createElement("div");
    row.className = "key-value-row";
    row.innerHTML = `
        <input class="kv-key" placeholder="Name" value="${escapeHtml(key)}">
        <input class="kv-value" placeholder="Value" value="${escapeHtml(value)}">
        <button type="button" class="remove-row">×</button>
    `;
    row.querySelector(".remove-row").addEventListener("click", () => row.remove());
    container.appendChild(row);
}

$("addHeaderBtn").addEventListener("click", () => addKeyValueRow("headersEditor"));
$("addParamBtn").addEventListener("click", () => addKeyValueRow("paramsEditor"));

addKeyValueRow("headersEditor", "Authorization", "Bearer mock-token-123");

$("sendRequestBtn").addEventListener("click", async () => {
    hide("testerError");
    show("testerLoading");

    try {
        const headers = {};
        document.querySelectorAll("#headersEditor .key-value-row").forEach(row => {
            const key = row.querySelector(".kv-key").value.trim();
            const value = row.querySelector(".kv-value").value;
            if (key) headers[key] = value;
        });

        const params = {};
        document.querySelectorAll("#paramsEditor .key-value-row").forEach(row => {
            const key = row.querySelector(".kv-key").value.trim();
            const value = row.querySelector(".kv-value").value;
            if (key) params[key] = value;
        });

        const result = await postJSON("/api/tester/", {
            method: $("httpMethod").value,
            url: $("requestUrl").value.trim(),
            headers,
            params,
            body: $("requestBody").value.trim()
        });

        $("responseStatus").textContent = `HTTP ${result.status_code}`;
        $("responseTime").textContent = `${result.response_time_ms} ms`;
        $("responseBody").textContent = JSON.stringify(result.data, null, 2);
    } catch (error) {
        showError("testerError", error.message);
        $("responseStatus").textContent = "Error";
        $("responseTime").textContent = "-";
        $("responseBody").textContent = "{}";
    } finally {
        hide("testerLoading");
    }
});

/* ---------- Database Query ---------- */

$("runQueryBtn").addEventListener("click", runQuery);

$("failedQueryBtn").addEventListener("click", () => {
    $("sqlQuery").value = `
SELECT id, method, url, status_code, response_time_ms, success, created_at
FROM explorer_apilog
WHERE status_code > 399 OR response_time_ms > 2000
ORDER BY created_at DESC;`.trim();
    runQuery();
});

async function runQuery() {
    hide("queryError");

    try {
        const result = await postJSON("/api/logs/query/", {
            query: $("sqlQuery").value
        });

        $("queryResultMeta").textContent = `${result.count} result(s)`;
        renderQueryTable(result.columns, result.rows);
    } catch (error) {
        showError("queryError", error.message);
    }
}

function renderQueryTable(columns, rows) {
    const thead = $("queryTable").querySelector("thead");
    const tbody = $("queryTable").querySelector("tbody");

    thead.innerHTML = `<tr>${columns.map(c => `<th>${escapeHtml(c)}</th>`).join("")}</tr>`;
    tbody.innerHTML = rows.map(row => `
        <tr>
            ${columns.map(c => `<td>${escapeHtml(row[c] ?? "")}</td>`).join("")}
        </tr>
    `).join("");
};

/* ---------- Tabs ---------- */

document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));

        btn.classList.add("active");
        $(`${btn.dataset.tab}Tab`).classList.add("active");
    });
});



Document.getElementById('repoBtn').addEventListener('click', () => {
    console.log('Repository button clicked');
});