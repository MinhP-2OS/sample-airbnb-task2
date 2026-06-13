const API_BASE = "http://127.0.0.1:5000";

let currentSearchParams = {};
let currentPage = 1;

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadPropertyTypes() {
  try {
    const res = await fetch(`${API_BASE}/api/property-types`);
    if (!res.ok) return;
    const { types } = await res.json();
    const sel = document.getElementById("propertyType");
    types.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      sel.appendChild(opt);
    });
  } catch (e) {
    console.warn("Could not load property types:", e.message);
  }
}

async function loadListings(params = {}, page = 1) {
  const grid = document.getElementById("listingsGrid");
  const spinner = document.getElementById("loadingSpinner");
  const noResults = document.getElementById("noResults");
  const noDb = document.getElementById("noDbAlert");
  const countBadge = document.getElementById("resultsCount");
  const paginationEl = document.getElementById("pagination");

  grid.innerHTML = "";
  if (paginationEl) paginationEl.innerHTML = "";
  spinner.classList.remove("d-none");
  noResults.classList.add("d-none");
  if (noDb) noDb.classList.add("d-none");

  try {
    const qs = new URLSearchParams();
    if (params.market) qs.set("market", params.market);
    if (params.property_type) qs.set("property_type", params.property_type);
    if (params.bedrooms) qs.set("bedrooms", params.bedrooms);
    qs.set("page", page);

    const res = await fetch(`${API_BASE}/api/listings?${qs}`);
    const data = await res.json();

    spinner.classList.add("d-none");

    if (!res.ok || data.error) {
      if (noDb) noDb.classList.remove("d-none");
      countBadge.textContent = "";
      return "db_error";
    }

    const listings = data.listings || [];
    const total = data.total || 0;
    const totalPages = data.totalPages || 1;

    if (listings.length === 0) {
      noResults.classList.remove("d-none");
      countBadge.textContent = "0 results";
      return;
    }

    const isSearch = !!(
      params.market ||
      params.property_type ||
      params.bedrooms
    );
    if (isSearch) {
      const start = (page - 1) * 20 + 1;
      const end = Math.min(page * 20, total);
      countBadge.textContent = `${start}–${end} of ${total} result${total !== 1 ? "s" : ""}`;
    } else {
      countBadge.textContent = `${listings.length} featured`;
    }

    listings.forEach((listing) => {
      const col = document.createElement("div");
      col.className = "col-md-6 col-lg-4";

      const rating = listing.review_scores_rating;
      const ratingHtml =
        rating !== null && rating !== undefined
          ? `<span class="rating-badge"><i class="bi bi-star-fill me-1"></i>${rating}</span>`
          : `<span class="badge bg-light text-muted border">Not rated</span>`;

      const imgHtml = listing.picture_url
        ? `<img src="${escapeHtml(listing.picture_url)}" class="card-img-top"
                       alt="${escapeHtml(listing.name)}"
                       onerror="this.parentElement.innerHTML='<div class=\\'listing-img-placeholder\\'><i class=\\'bi bi-house\\'></i></div>'">`
        : `<div class="listing-img-placeholder"><i class="bi bi-house"></i></div>`;

      const bedroomText =
        listing.bedrooms != null
          ? `<small class="text-muted mt-2 d-block">
                       <i class="bi bi-door-closed me-1"></i>${listing.bedrooms} bedroom${listing.bedrooms !== 1 ? "s" : ""}
                   </small>`
          : "";

      col.innerHTML = `
                <div class="card listing-card h-100">
                    ${imgHtml}
                    <div class="card-body d-flex flex-column">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            ${ratingHtml}
                            <span class="badge bg-light text-secondary border ms-auto">
                                ${escapeHtml(listing.property_type || "")}
                            </span>
                        </div>
                        <h5 class="card-title mb-1">
                            <a href="bookings.html?listing_id=${encodeURIComponent(listing.listing_id)}"
                               class="listing-title-link">
                               ${escapeHtml(listing.name)}
                            </a>
                        </h5>
                        <p class="summary-text mb-3">${escapeHtml(listing.summary || "")}</p>
                        <div class="mt-auto d-flex justify-content-between align-items-center">
                            <div>
                                <i class="bi bi-geo-alt text-muted me-1"></i>
                                <small class="text-muted">${escapeHtml(listing.market || "")}</small>
                            </div>
                            <span class="price-badge">
                                $${listing.price ? listing.price.toFixed(0) : "?"}/night
                            </span>
                        </div>
                        ${bedroomText}
                    </div>
                    <div class="card-footer bg-transparent border-0 pt-0 pb-3">
                        <a href="bookings.html?listing_id=${encodeURIComponent(listing.listing_id)}"
                           class="btn btn-danger btn-sm w-100">
                           <i class="bi bi-calendar-plus me-1"></i>Book Now
                        </a>
                    </div>
                </div>`;

      grid.appendChild(col);
    });

    // Render pagination only for search results with multiple pages
    if (isSearch && totalPages > 1 && paginationEl) {
      renderPagination(paginationEl, page, totalPages, params);
    }
  } catch (e) {
    spinner.classList.add("d-none");
    if (noDb) noDb.classList.remove("d-none");
    console.error("Load listings error:", e);
  }
}

function renderPagination(container, currentPg, totalPages, params) {
  const ul = document.createElement("ul");
  ul.className = "pagination justify-content-center flex-wrap";

  const makeLi = (label, pg, disabled = false, active = false) => {
    const li = document.createElement("li");
    li.className = `page-item${disabled ? " disabled" : ""}${active ? " active" : ""}`;
    const a = document.createElement("a");
    a.className = "page-link";
    a.href = "#";
    a.innerHTML = label;
    if (!disabled && !active) {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        currentPage = pg;
        loadListings(params, pg);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
    li.appendChild(a);
    return li;
  };

  ul.appendChild(makeLi("&laquo;", currentPg - 1, currentPg === 1));

  // Show at most 7 page buttons around current page
  let start = Math.max(1, currentPg - 3);
  let end = Math.min(totalPages, currentPg + 3);
  if (currentPg <= 4) end = Math.min(totalPages, 7);
  if (currentPg >= totalPages - 3) start = Math.max(1, totalPages - 6);

  if (start > 1) {
    ul.appendChild(makeLi("1", 1));
    if (start > 2) {
      const li = document.createElement("li");
      li.className = "page-item disabled";
      li.innerHTML = '<span class="page-link">…</span>';
      ul.appendChild(li);
    }
  }

  for (let p = start; p <= end; p++) {
    ul.appendChild(makeLi(p, p, false, p === currentPg));
  }

  if (end < totalPages) {
    if (end < totalPages - 1) {
      const li = document.createElement("li");
      li.className = "page-item disabled";
      li.innerHTML = '<span class="page-link">…</span>';
      ul.appendChild(li);
    }
    ul.appendChild(makeLi(totalPages, totalPages));
  }

  ul.appendChild(makeLi("&raquo;", currentPg + 1, currentPg === totalPages));

  container.appendChild(ul);
}

document.getElementById("searchForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const market = document.getElementById("location").value.trim();
  const property_type = document.getElementById("propertyType").value;
  const bedrooms = document.getElementById("bedrooms").value;

  currentSearchParams = { market, property_type, bedrooms };
  currentPage = 1;

  document.getElementById("resultsTitle").innerHTML =
    `<i class="bi bi-house-door text-danger me-2"></i>Results for "${escapeHtml(market)}"`;

  await loadListings(currentSearchParams, 1);
});

async function initPage() {
  await loadPropertyTypes();
  const firstTry = await loadListings();
  if (firstTry === "db_error") {
    setTimeout(() => loadListings(), 2000);
  }
}

initPage();
